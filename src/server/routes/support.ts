import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  accounts,
  plans,
  projects,
  supportMessages,
  supportTickets,
  tracks,
  users,
} from '../db/schema.js';
import { accountForUser } from '../services/accounts.js';
import { requireSuperAdmin, writeAuditLog } from '../services/admin.js';
import { requireUser } from '../services/auth.js';
import {
  supportStatusAfterMessage,
  supportTicketPriorities,
  supportTicketStatusDates,
  supportTicketStatuses,
} from '../services/support.js';

const ticketParamsSchema = z.object({ id: z.string().uuid() });
const messageSchema = z.object({ body: z.string().trim().min(1).max(10_000) });
const createTicketSchema = messageSchema.extend({ subject: z.string().trim().min(3).max(160) });
const userTicketUpdateSchema = z.object({ status: z.enum(['open', 'resolved', 'closed']) });
const adminTicketUpdateSchema = z.object({
  status: z.enum(supportTicketStatuses).optional(),
  priority: z.enum(supportTicketPriorities).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Aucune modification fournie.' });
const adminReplySchema = messageSchema.extend({
  status: z.enum(['awaiting_user', 'resolved', 'closed']).default('awaiting_user'),
});

function numeric(value: unknown): number {
  return Number(value ?? 0);
}

function ticketCounters() {
  return {
    messageCount: sql<number>`(select count(*)::int from ${supportMessages} sm where sm.ticket_id = ${sql.raw('"support_tickets"."id"')})`,
    unreadCount: sql<number>`(select count(*)::int from ${supportMessages} sm where sm.ticket_id = ${sql.raw('"support_tickets"."id"')} and sm.author_kind = 'admin' and sm.created_at > ${sql.raw('"support_tickets"."user_last_read_at"')})`,
  };
}

async function userTicket(userId: string, ticketId: string) {
  const [ticket] = await db.select().from(supportTickets).where(and(
    eq(supportTickets.id, ticketId),
    eq(supportTickets.createdByUserId, userId),
  )).limit(1);
  return ticket;
}

async function ticketMessages(ticketId: string) {
  return db.select({
    id: supportMessages.id,
    ticketId: supportMessages.ticketId,
    authorUserId: supportMessages.authorUserId,
    authorKind: supportMessages.authorKind,
    body: supportMessages.body,
    createdAt: supportMessages.createdAt,
    authorName: users.displayName,
  }).from(supportMessages)
    .leftJoin(users, eq(supportMessages.authorUserId, users.id))
    .where(eq(supportMessages.ticketId, ticketId))
    .orderBy(asc(supportMessages.createdAt));
}

export async function supportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/support/tickets', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const account = await accountForUser(user.id);
    if (!account) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    const rows = await db.select({
      id: supportTickets.id,
      accountId: supportTickets.accountId,
      createdByUserId: supportTickets.createdByUserId,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      lastMessageAt: supportTickets.lastMessageAt,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      ...ticketCounters(),
    }).from(supportTickets).where(and(
      eq(supportTickets.accountId, account.account.id),
      eq(supportTickets.createdByUserId, user.id),
    )).orderBy(desc(supportTickets.lastMessageAt));
    return { tickets: rows.map((ticket) => ({
      ...ticket,
      messageCount: numeric(ticket.messageCount),
      unreadCount: numeric(ticket.unreadCount),
    })) };
  });

  app.post('/api/support/tickets', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const account = await accountForUser(user.id);
    if (!account) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    const input = createTicketSchema.parse(request.body);
    const now = new Date();
    const ticket = await db.transaction(async (transaction) => {
      const [created] = await transaction.insert(supportTickets).values({
        accountId: account.account.id,
        createdByUserId: user.id,
        subject: input.subject,
        lastMessageAt: now,
        userLastReadAt: now,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await transaction.insert(supportMessages).values({
        ticketId: created.id,
        authorUserId: user.id,
        authorKind: 'user',
        body: input.body,
        createdAt: now,
      });
      return created;
    });
    return reply.code(201).send({ ticket: { ...ticket, messageCount: 1, unreadCount: 0 } });
  });

  app.get('/api/support/tickets/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = ticketParamsSchema.parse(request.params);
    const ticket = await userTicket(user.id, id);
    if (!ticket) return reply.code(404).send({ error: 'Demande de support introuvable.' });
    await db.update(supportTickets).set({ userLastReadAt: new Date() }).where(eq(supportTickets.id, id));
    const messages = await ticketMessages(id);
    return { ticket: { ...ticket, messageCount: messages.length, unreadCount: 0 }, messages };
  });

  app.post('/api/support/tickets/:id/messages', {
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = ticketParamsSchema.parse(request.params);
    const input = messageSchema.parse(request.body);
    const ticket = await userTicket(user.id, id);
    if (!ticket) return reply.code(404).send({ error: 'Demande de support introuvable.' });
    if (ticket.status === 'closed') return reply.code(409).send({ error: 'Cette demande est close. Vous pouvez créer une nouvelle demande.' });
    const now = new Date();
    const [message] = await db.transaction(async (transaction) => {
      const inserted = await transaction.insert(supportMessages).values({
        ticketId: id,
        authorUserId: user.id,
        authorKind: 'user',
        body: input.body,
        createdAt: now,
      }).returning();
      await transaction.update(supportTickets).set({
        status: supportStatusAfterMessage('user'),
        lastMessageAt: now,
        userLastReadAt: now,
        updatedAt: now,
        ...supportTicketStatusDates('open', now),
      }).where(eq(supportTickets.id, id));
      return inserted;
    });
    return reply.code(201).send({ message: { ...message, authorName: user.displayName } });
  });

  app.patch('/api/support/tickets/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = ticketParamsSchema.parse(request.params);
    const input = userTicketUpdateSchema.parse(request.body);
    const ticket = await userTicket(user.id, id);
    if (!ticket) return reply.code(404).send({ error: 'Demande de support introuvable.' });
    const now = new Date();
    const [updated] = await db.update(supportTickets).set({
      status: input.status,
      userLastReadAt: now,
      updatedAt: now,
      ...supportTicketStatusDates(input.status, now),
    }).where(eq(supportTickets.id, id)).returning();
    return { ticket: updated };
  });

  app.get('/api/admin/support/tickets', async (request, reply) => {
    const admin = await requireSuperAdmin(request, reply);
    if (!admin) return;
    const input = z.object({
      search: z.string().trim().max(120).default(''),
      status: z.enum(supportTicketStatuses).optional(),
    }).parse(request.query);
    const searchFilter = input.search ? or(
      ilike(supportTickets.subject, `%${input.search}%`),
      ilike(users.email, `%${input.search}%`),
      ilike(users.displayName, `%${input.search}%`),
      ilike(accounts.name, `%${input.search}%`),
    ) : undefined;
    const rows = await db.select({
      id: supportTickets.id,
      accountId: supportTickets.accountId,
      createdByUserId: supportTickets.createdByUserId,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      lastMessageAt: supportTickets.lastMessageAt,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      userName: users.displayName,
      userEmail: users.email,
      accountName: accounts.name,
      accountStatus: accounts.accessStatus,
      planCode: plans.code,
      planName: plans.name,
      storageQuotaBytes: sql<number>`coalesce(${accounts.storageQuotaOverrideBytes}, ${plans.storageQuotaBytes})`,
      storageUsedBytes: sql<number>`(select coalesce(sum(f.size_bytes), 0)::bigint from (select distinct t.storage_key, t.size_bytes from ${projects} p join ${tracks} t on t.project_id = p.id where p.account_id = ${accounts.id}) f)`,
      messageCount: sql<number>`(select count(*)::int from ${supportMessages} sm where sm.ticket_id = ${sql.raw('"support_tickets"."id"')})`,
      unreadCount: sql<number>`(select count(*)::int from ${supportMessages} sm where sm.ticket_id = ${sql.raw('"support_tickets"."id"')} and sm.author_kind = 'user' and sm.created_at > coalesce(${sql.raw('"support_tickets"."admin_last_read_at"')}, to_timestamp(0)))`,
    }).from(supportTickets)
      .innerJoin(users, eq(supportTickets.createdByUserId, users.id))
      .innerJoin(accounts, eq(supportTickets.accountId, accounts.id))
      .innerJoin(plans, eq(accounts.planCode, plans.code))
      .where(and(input.status ? eq(supportTickets.status, input.status) : undefined, searchFilter))
      .orderBy(
        sql`case ${supportTickets.status} when 'open' then 0 when 'awaiting_user' then 1 when 'resolved' then 2 else 3 end`,
        desc(supportTickets.lastMessageAt),
      ).limit(300);
    return { tickets: rows.map((ticket) => ({
      ...ticket,
      storageQuotaBytes: numeric(ticket.storageQuotaBytes),
      storageUsedBytes: numeric(ticket.storageUsedBytes),
      messageCount: numeric(ticket.messageCount),
      unreadCount: numeric(ticket.unreadCount),
    })) };
  });

  app.get('/api/admin/support/tickets/:id', async (request, reply) => {
    const admin = await requireSuperAdmin(request, reply);
    if (!admin) return;
    const { id } = ticketParamsSchema.parse(request.params);
    const [ticket] = await db.select({
      id: supportTickets.id,
      accountId: supportTickets.accountId,
      createdByUserId: supportTickets.createdByUserId,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      lastMessageAt: supportTickets.lastMessageAt,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      userName: users.displayName,
      userEmail: users.email,
      accountName: accounts.name,
      accountStatus: accounts.accessStatus,
      planCode: plans.code,
      planName: plans.name,
      storageQuotaBytes: sql<number>`coalesce(${accounts.storageQuotaOverrideBytes}, ${plans.storageQuotaBytes})`,
      storageUsedBytes: sql<number>`(select coalesce(sum(f.size_bytes), 0)::bigint from (select distinct t.storage_key, t.size_bytes from ${projects} p join ${tracks} t on t.project_id = p.id where p.account_id = ${accounts.id}) f)`,
    }).from(supportTickets)
      .innerJoin(users, eq(supportTickets.createdByUserId, users.id))
      .innerJoin(accounts, eq(supportTickets.accountId, accounts.id))
      .innerJoin(plans, eq(accounts.planCode, plans.code))
      .where(eq(supportTickets.id, id)).limit(1);
    if (!ticket) return reply.code(404).send({ error: 'Demande de support introuvable.' });
    await db.update(supportTickets).set({ adminLastReadAt: new Date() }).where(eq(supportTickets.id, id));
    const messages = await ticketMessages(id);
    return {
      ticket: {
        ...ticket,
        storageQuotaBytes: numeric(ticket.storageQuotaBytes),
        storageUsedBytes: numeric(ticket.storageUsedBytes),
        messageCount: messages.length,
        unreadCount: 0,
      },
      messages,
    };
  });

  app.post('/api/admin/support/tickets/:id/messages', async (request, reply) => {
    const admin = await requireSuperAdmin(request, reply);
    if (!admin) return;
    const { id } = ticketParamsSchema.parse(request.params);
    const input = adminReplySchema.parse(request.body);
    const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    if (!ticket) return reply.code(404).send({ error: 'Demande de support introuvable.' });
    const now = new Date();
    const [message] = await db.transaction(async (transaction) => {
      const inserted = await transaction.insert(supportMessages).values({
        ticketId: id,
        authorUserId: admin.id,
        authorKind: 'admin',
        body: input.body,
        createdAt: now,
      }).returning();
      await transaction.update(supportTickets).set({
        status: input.status,
        lastMessageAt: now,
        adminLastReadAt: now,
        updatedAt: now,
        ...supportTicketStatusDates(input.status, now),
      }).where(eq(supportTickets.id, id));
      return inserted;
    });
    await writeAuditLog({ actorUserId: admin.id, action: 'support.replied', entityType: 'support_ticket', entityId: id, details: { status: input.status }, ipAddress: request.ip });
    return reply.code(201).send({ message: { ...message, authorName: admin.displayName } });
  });

  app.patch('/api/admin/support/tickets/:id', async (request, reply) => {
    const admin = await requireSuperAdmin(request, reply);
    if (!admin) return;
    const { id } = ticketParamsSchema.parse(request.params);
    const input = adminTicketUpdateSchema.parse(request.body);
    const now = new Date();
    const [updated] = await db.update(supportTickets).set({
      status: input.status,
      priority: input.priority,
      adminLastReadAt: now,
      updatedAt: now,
      ...(input.status ? supportTicketStatusDates(input.status, now) : {}),
    }).where(eq(supportTickets.id, id)).returning();
    if (!updated) return reply.code(404).send({ error: 'Demande de support introuvable.' });
    await writeAuditLog({ actorUserId: admin.id, action: 'support.updated', entityType: 'support_ticket', entityId: id, details: input, ipAddress: request.ip });
    return { ticket: updated };
  });
}
