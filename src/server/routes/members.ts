import { removeUnreferencedFiles } from '../services/shared-files.js';
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { accountMemberships, accounts, plans, projects, projectShares, sessions, tracks, users } from '../db/schema.js';
import { hashPassword, publicUser, requireUser, sessionEvents } from '../services/auth.js';
import { accountForUser, requireWritableAccount } from '../services/accounts.js';
import { memberIsAllowed, membershipAccess, MembershipError } from '../services/memberships.js';

const memberFields = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

export async function memberRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/account/members', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const context = await accountForUser(user.id);
    if (!context) return reply.code(404).send({ error: 'Compte introuvable.' });
    const members = await db.select({ id: users.id, displayName: users.displayName, email: users.email, role: accountMemberships.role, disabledAt: users.disabledAt })
      .from(accountMemberships).innerJoin(users, eq(users.id, accountMemberships.userId))
      .where(eq(accountMemberships.accountId, context.account.id))
      .orderBy(sql`(${accountMemberships.role} = 'owner') desc`, asc(accountMemberships.createdAt), asc(users.id));
    return { maxUsers: context.plan.maxUsers, members: members.map((member, index) => ({ ...member, allowed: !member.disabledAt && memberIsAllowed(context.plan.maxUsers, member.role, index) })) };
  });

  app.post('/api/account/members', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const input = memberFields.parse(request.body);
    const context = await requireWritableAccount(user.id);
    const passwordHash = await hashPassword(input.password);
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from accounts where id = ${context.account.id} for update`);
      const [membership] = await tx.select().from(accountMemberships).where(and(eq(accountMemberships.accountId, context.account.id), eq(accountMemberships.userId, user.id)));
      if (membership?.role !== 'owner' || user.isDemo) throw new MembershipError('Seul le titulaire peut gérer les utilisateurs.');
      const [current] = await tx.select({ maxUsers: plans.maxUsers }).from(accounts).innerJoin(plans, eq(plans.code, accounts.planCode)).where(eq(accounts.id, context.account.id));
      const members = await tx.select({ id: accountMemberships.userId }).from(accountMemberships).where(eq(accountMemberships.accountId, context.account.id));
      if (!current.maxUsers || members.length >= current.maxUsers) throw new MembershipError('La limite d’utilisateurs du forfait est atteinte ou cette fonctionnalité est désactivée.');
      const [member] = await tx.insert(users).values({ email: input.email, displayName: input.displayName, passwordHash }).returning();
      await tx.insert(accountMemberships).values({ accountId: context.account.id, userId: member.id, role: 'member' });
      await tx.insert(projects).values({ accountId: context.account.id, userId: member.id, name: 'Mon premier spectacle' });
      return member;
    });
    return reply.code(201).send({ user: publicUser(created) });
  });

  app.patch('/api/account/members/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = memberFields.pick({ displayName: true }).extend({ disabled: z.boolean() }).partial().refine((value) => Object.keys(value).length > 0, { message: 'Aucune modification fournie.' }).parse(request.body);
    const context = await requireWritableAccount(user.id);
    const access = await membershipAccess(user.id);
    if (access?.role !== 'owner' || user.isDemo) throw new MembershipError('Seul le titulaire peut gérer les utilisateurs.');
    const hashes = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from accounts where id = ${context.account.id} for update`);
      const [member] = await tx.select().from(accountMemberships).where(and(eq(accountMemberships.accountId, context.account.id), eq(accountMemberships.userId, id)));
      if (!member || member.role === 'owner') throw new MembershipError('Utilisateur modifiable introuvable.');
      await tx.update(users).set({ ...(input.displayName ? { displayName: input.displayName } : {}), ...(input.disabled !== undefined ? { disabledAt: input.disabled ? new Date() : null } : {}) }).where(eq(users.id, id));
      return input.disabled ? tx.delete(sessions).where(eq(sessions.userId, id)).returning({ hash: sessions.tokenHash }) : [];
    });
    for (const session of hashes) sessionEvents.emit('revoked', session.hash);
    return reply.code(204).send();
  });

  app.delete('/api/account/members/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const context = await requireWritableAccount(user.id);
    if ((await membershipAccess(user.id))?.role !== 'owner' || user.isDemo) throw new MembershipError('Seul le titulaire peut gérer les utilisateurs.');
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from accounts where id = ${context.account.id} for update`);
      const [member] = await tx.select().from(accountMemberships).where(and(eq(accountMemberships.accountId, context.account.id), eq(accountMemberships.userId, id)));
      if (!member || member.role === 'owner') throw new MembershipError('Utilisateur supprimable introuvable.');
      const files = await tx.select({ key: tracks.storageKey }).from(tracks).innerJoin(projects, eq(projects.id, tracks.projectId))
        .where(and(eq(projects.accountId, context.account.id), eq(projects.userId, id)));
      const hashes = await tx.delete(sessions).where(eq(sessions.userId, id)).returning({ hash: sessions.tokenHash });
      await tx.delete(projects).where(and(eq(projects.accountId, context.account.id), eq(projects.userId, id)));
      await tx.delete(projectShares).where(and(eq(projectShares.userId, id), inArray(projectShares.projectId, tx.select({ id: projects.id }).from(projects).where(eq(projects.accountId, context.account.id)))));
      await tx.delete(accountMemberships).where(and(eq(accountMemberships.accountId, context.account.id), eq(accountMemberships.userId, id)));
      // Keep the identity for audit and support history; it no longer has access to this account.
      return { files, hashes };
    });
    for (const session of result.hashes) sessionEvents.emit('revoked', session.hash);
    await removeUnreferencedFiles(result.files.map((file) => file.key));
    return reply.code(204).send();
  });

  // This read-only catalogue enables copying; editing remains restricted to one's own projects.
  app.get('/api/account/library', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const context = await accountForUser(user.id);
    if (!context?.plan.maxUsers) throw new MembershipError('Le partage entre utilisateurs n’est pas inclus dans votre forfait.');
    const library = await db.select({ id: tracks.id, title: tracks.title, projectId: projects.id, projectName: projects.name, userId: users.id, displayName: users.displayName })
      .from(tracks).innerJoin(projects, eq(projects.id, tracks.projectId)).innerJoin(users, eq(users.id, projects.userId))
      .where(eq(projects.accountId, context.account.id)).orderBy(asc(users.displayName), asc(projects.name), asc(tracks.position));
    const destinations = await db.select({ id: projects.id, name: projects.name, userId: users.id, displayName: users.displayName })
      .from(projects).innerJoin(users, eq(users.id, projects.userId)).where(eq(projects.accountId, context.account.id)).orderBy(asc(users.displayName), asc(projects.name));
    return { tracks: library, projects: destinations };
  });

  app.post('/api/account/copy-tracks', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const input = z.object({ trackIds: z.array(z.string().uuid()).min(1).max(500), projectId: z.string().uuid() }).parse(request.body);
    const context = await requireWritableAccount(user.id);
    const copied = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from accounts where id = ${context.account.id} for update`);
      const [current] = await tx.select({ maxUsers: plans.maxUsers }).from(accounts).innerJoin(plans, eq(plans.code, accounts.planCode)).where(eq(accounts.id, context.account.id));
      if (!current.maxUsers) throw new MembershipError('Le partage entre utilisateurs n’est pas inclus dans votre forfait.');
      const [target] = await tx.select().from(projects).where(and(eq(projects.id, input.projectId), eq(projects.accountId, context.account.id))).for('update');
      if (!target) throw new MembershipError('Spectacle de destination introuvable.');
      const sourceQuery = () => tx.select({ track: tracks, userId: projects.userId }).from(tracks).innerJoin(projects, eq(projects.id, tracks.projectId))
        .where(and(inArray(tracks.id, [...new Set(input.trackIds)]), eq(projects.accountId, context.account.id)));
      const candidates = await sourceQuery();
      for (const key of [...new Set(candidates.map(({ track }) => track.storageKey))].sort()) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      }
      const sources = await sourceQuery();
      if (sources.length !== new Set(input.trackIds).size || sources.some((source) => source.userId !== user.id && target.userId !== user.id)) {
        throw new MembershipError('Les copies doivent provenir de vos sons ou être destinées à votre espace.');
      }
      const [last] = await tx.select({ position: sql<number>`coalesce(max(${tracks.position}), -1)::int` }).from(tracks).where(eq(tracks.projectId, target.id));
      return tx.insert(tracks).values(sources.map(({ track }, index) => ({
        ...track, id: undefined, createdAt: new Date(), projectId: target.id, categoryId: null, subcategoryId: null,
        position: last.position + index + 1,
      }))).returning();
    });
    return reply.code(201).send({ tracks: copied });
  });
}
