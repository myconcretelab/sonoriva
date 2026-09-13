import type { FastifyInstance } from 'fastify';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { accountMemberships, accounts, plans, projects, projectShares } from '../db/schema.js';
import { requireUser } from '../services/auth.js';
import { ownsProject } from '../services/ownership.js';
import { accountForUser } from '../services/accounts.js';
import { MembershipError } from '../services/memberships.js';

export async function projectSharingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects/:id/sharing', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    if (!(await ownsProject(user.id, id))) return reply.code(404).send({ error: 'Spectacle personnel introuvable.' });
    const shares = await db.select({ userId: projectShares.userId }).from(projectShares).where(eq(projectShares.projectId, id));
    return { userIds: shares.map((share) => share.userId) };
  });

  app.put('/api/projects/:id/sharing', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { userIds } = z.object({ userIds: z.array(z.string().uuid()).max(999).transform((ids) => [...new Set(ids)]) }).parse(request.body);
    const context = await accountForUser(user.id);
    if (!context) return reply.code(404).send({ error: 'Compte introuvable.' });
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from accounts where id = ${context.account.id} for update`);
      const [project] = await tx.select().from(projects).where(and(eq(projects.id, id), eq(projects.accountId, context.account.id), eq(projects.userId, user.id))).for('update');
      if (!project) throw new MembershipError('Seul le propriétaire du spectacle peut gérer son partage.');
      const [plan] = await tx.select({ maxUsers: plans.maxUsers }).from(accounts).innerJoin(plans, eq(plans.code, accounts.planCode)).where(eq(accounts.id, context.account.id));
      if (userIds.length) {
        if (!plan.maxUsers || user.isDemo) throw new MembershipError('Le partage entre utilisateurs n’est pas inclus dans votre forfait.');
        const members = await tx.select({ id: accountMemberships.userId }).from(accountMemberships)
          .where(and(eq(accountMemberships.accountId, context.account.id), inArray(accountMemberships.userId, userIds)));
        if (userIds.includes(user.id) || members.length !== userIds.length) throw new MembershipError('Choisissez uniquement d’autres utilisateurs de votre compte.');
      }
      await tx.delete(projectShares).where(eq(projectShares.projectId, id));
      if (userIds.length) await tx.insert(projectShares).values(userIds.map((userId) => ({ projectId: id, userId })));
    });
    return { userIds };
  });
}
