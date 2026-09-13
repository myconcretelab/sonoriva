import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accountMemberships, accounts, plans, users } from '../db/schema.js';

export class MembershipError extends Error {
  readonly statusCode = 403;
}

export function memberIsAllowed(maxUsers: number, role: string, position: number): boolean {
  return role === 'owner' || (maxUsers > 0 && position < maxUsers);
}

export async function membershipAccess(userId: string, connection: Pick<typeof db, 'select'> = db) {
  const [context] = await connection.select({ accountId: accounts.id, maxUsers: plans.maxUsers })
    .from(accountMemberships).innerJoin(accounts, eq(accounts.id, accountMemberships.accountId))
    .innerJoin(plans, eq(plans.code, accounts.planCode))
    .where(eq(accountMemberships.userId, userId)).orderBy(asc(accountMemberships.createdAt)).limit(1);
  if (!context) return null;
  const members = await connection.select({ userId: users.id, role: accountMemberships.role, disabledAt: users.disabledAt })
    .from(accountMemberships).innerJoin(users, eq(users.id, accountMemberships.userId))
    .where(eq(accountMemberships.accountId, context.accountId))
    .orderBy(sql`(${accountMemberships.role} = 'owner') desc`, asc(accountMemberships.createdAt), asc(users.id));
  const position = members.findIndex((member) => member.userId === userId);
  if (position < 0 || members[position].disabledAt || !memberIsAllowed(context.maxUsers, members[position].role, position)) return null;
  return { ...context, role: members[position].role };
}
