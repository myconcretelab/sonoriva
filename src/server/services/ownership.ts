import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accountMemberships, projects } from '../db/schema.js';

export async function ownsProject(userId: string, projectId: string): Promise<boolean> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(accountMemberships, eq(accountMemberships.accountId, projects.accountId))
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId), eq(accountMemberships.userId, userId)))
    .limit(1);
  return Boolean(project);
}
