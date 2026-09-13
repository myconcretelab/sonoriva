import { EventEmitter } from 'node:events';
import { MembershipError, membershipAccess } from './memberships.js';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { accountMemberships, sessions, users, type User } from '../db/schema.js';
import { demoExpiration, demoLimitsForUser } from './demo.js';

export const sessionEvents = new EventEmitter();
sessionEvents.setMaxListeners(0);

const scrypt = promisify(scryptCallback);
export const sessionCookieName = 'sonoriva_session';
const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function sessionCookieOptions(expires?: Date) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    ...(expires ? { expires } : {}),
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString('base64')}.${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltBase64, hashBase64] = stored.split('.');
  if (!saltBase64 || !hashBase64) return false;
  const expected = Buffer.from(hashBase64, 'base64');
  const actual = (await scrypt(password, Buffer.from(saltBase64, 'base64'), expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function startSession(userId: string, reply: FastifyReply): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  const revoked = await db.transaction(async (tx) => {
    const memberships = await tx.select({ accountId: accountMemberships.accountId }).from(accountMemberships)
      .where(eq(accountMemberships.userId, userId)).orderBy(accountMemberships.accountId);
    for (const membership of memberships) {
      await tx.execute(sql`select id from accounts where id = ${membership.accountId} for update`);
    }
    if (!(await membershipAccess(userId, tx))) throw new MembershipError('Votre accès utilisateur n’est pas inclus dans le forfait actuel.');
    const memberIds = tx.select({ userId: accountMemberships.userId }).from(accountMemberships)
      .where(inArray(accountMemberships.accountId, memberships.map((membership) => membership.accountId)));
    const previous = await tx.delete(sessions).where(inArray(sessions.userId, memberIds)).returning({ hash: sessions.tokenHash });
    await tx.insert(sessions).values({ tokenHash: tokenHash(token), userId, expiresAt });
    return previous;
  });
  for (const session of revoked) sessionEvents.emit('revoked', session.hash);
  reply.setCookie(sessionCookieName, token, sessionCookieOptions(expiresAt));
}

export async function endSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[sessionCookieName];
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
  reply.clearCookie(sessionCookieName, sessionCookieOptions());
}

export async function userFromToken(token?: string): Promise<User | null> {
  if (!token) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row?.user || row.user.disabledAt || !(await membershipAccess(row.user.id))) return null;
  if (row.user.isDemo && (!row.user.demoExpiresAt || row.user.demoExpiresAt <= new Date())) return null;
  return row.user;
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    platformRole: user.platformRole,
    isDemo: user.isDemo,
    demoExpiresAt: user.demoExpiresAt,
  };
}

export function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(';')) {
    const [key, ...value] = pair.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply): Promise<User | null> {
  const user = await userFromToken(request.cookies[sessionCookieName]);
  if (!user) {
    await reply.code(401).send({ error: 'Authentification requise.' });
    return null;
  }
  if (user.disabledAt) {
    await endSession(request, reply);
    await reply.code(403).send({ error: 'Ce compte utilisateur est désactivé.' });
    return null;
  }
  if (user.isDemo) {
    const now = new Date();
    const limits = await demoLimitsForUser(user.id);
    const lifetimeMs = limits.lifetimeHours * 60 * 60 * 1000;
    const renewalIntervalMs = Math.min(60 * 60 * 1000, lifetimeMs / 4);
    if (!user.demoExpiresAt || user.demoExpiresAt.getTime() < now.getTime() + lifetimeMs - renewalIntervalMs) {
      const expiresAt = demoExpiration(now, limits.lifetimeHours);
      await db.update(users).set({ demoExpiresAt: expiresAt }).where(eq(users.id, user.id));
      user.demoExpiresAt = expiresAt;
    }
  }
  return user;
}
