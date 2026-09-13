import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accountMemberships, projects } from '../db/schema.js';

export async function canAccessProject(userId: string, projectId: string): Promise<boolean> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(accountMemberships, eq(accountMemberships.accountId, projects.accountId))
    .where(and(eq(projects.id, projectId), projectAccessCondition(userId), eq(accountMemberships.userId, userId)))
    .limit(1);
  return Boolean(project);
}

// Callers also restrict the account through membership or an authenticated Bridge.
export function projectAccessCondition(userId: string) {
  return sql`(${projects.userId} = ${userId} or exists (
    select 1 from project_shares s
    join accounts a on a.id = ${projects.accountId}
    join plans p on p.code = a.plan_code
    join account_memberships m on m.account_id = a.id and m.user_id = s.user_id
    where s.project_id = ${projects.id} and s.user_id = ${userId} and p.max_users > 0
  ))`;
}

export async function ownsProject(userId: string, projectId: string): Promise<boolean> {
  const [project] = await db.select({ id: projects.id }).from(projects)
    .innerJoin(accountMemberships, eq(accountMemberships.accountId, projects.accountId))
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId), eq(accountMemberships.userId, userId))).limit(1);
  return Boolean(project);
}
