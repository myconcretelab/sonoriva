import { membershipAccess } from './memberships.js';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { accountMemberships, accounts, bridgeDevices, plans, sessions, users, type BridgeDevice, type User } from '../db/schema.js';
import { accountCanUseBridge } from './commercial-plans.js';

export const bridgePairingLifetimeMs = 5 * 60 * 1000;

export function hashBridgeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createBridgeToken(): string {
  return randomBytes(32).toString('base64url');
}

export function bridgePairingExpiration(now = new Date()): Date {
  return new Date(now.getTime() + bridgePairingLifetimeMs);
}

export function bearerToken(authorization: string | undefined): string | undefined {
  const match = /^Bearer ([A-Za-z0-9_-]{32,})$/.exec(authorization ?? '');
  return match?.[1];
}

async function bridgeAuthentication(authorization: string | undefined): Promise<{ device: BridgeDevice; user: User } | { status: number; error: string }> {
  const token = bearerToken(authorization);
  if (!token) {
    return { status: 401, error: 'Jeton SonoRiva Bridge requis.' };
  }
  const [context] = await db.select({
    device: bridgeDevices,
    accessStatus: accounts.accessStatus,
    isDemo: accounts.isDemo,
    monthlyPriceCents: plans.monthlyPriceCents,
    annualPriceCents: plans.annualPriceCents,
  }).from(bridgeDevices)
    .innerJoin(accounts, eq(bridgeDevices.accountId, accounts.id))
    .innerJoin(plans, eq(accounts.planCode, plans.code))
    .where(and(
      eq(bridgeDevices.tokenHash, hashBridgeToken(token)),
      isNull(bridgeDevices.revokedAt),
    ))
    .limit(1);
  if (!context) {
    return { status: 401, error: 'Ce bridge n’est pas associé ou a été révoqué.' };
  }
  if (!accountCanUseBridge(context)) {
    return { status: 403, error: 'SonoRiva Bridge est réservé aux forfaits payants actifs.' };
  }
  const [active] = await db.select({ user: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.userId, context.device.userId), gt(sessions.expiresAt, new Date()), isNull(users.disabledAt))).limit(1);
  if (!active || !(await membershipAccess(context.device.userId))) {
    return { status: 401, error: 'Connectez cet utilisateur pour synchroniser son bridge.' };
  }
  const now = new Date();
  await db.update(bridgeDevices)
    .set({ lastSeenAt: now, updatedAt: now })
    .where(eq(bridgeDevices.id, context.device.id));
  return { device: { ...context.device, lastSeenAt: now, updatedAt: now }, user: active.user };
}

export async function requireBridgeDevice(request: FastifyRequest, reply: FastifyReply): Promise<BridgeDevice | null> {
  const result = await bridgeAuthentication(request.headers.authorization);
  if ('error' in result) { await reply.code(result.status).send({ error: result.error }); return null; }
  return result.device;
}

export async function userFromBridgeAuthorization(authorization: string | undefined): Promise<User | null> {
  const result = await bridgeAuthentication(authorization);
  if ('error' in result) return null;
  // Workspace routes resolve the account from the user. Refuse ambiguous membership
  // rather than allowing one paired device to access a different account.
  const memberships = await db.select({ accountId: accountMemberships.accountId }).from(accountMemberships).where(eq(accountMemberships.userId, result.user.id));
  if (memberships.length !== 1 || memberships[0].accountId !== result.device.accountId) return null;
  return result.user;
}

export function bridgeConsoleRouteAllowed(method: string, path: string): boolean {
  if (path.includes('%') || path.includes('..') || path.includes('\\')) return false;
  if (method === 'GET' && ['/api/auth/me', '/api/account', '/api/health', '/api/version', '/api/releases'].includes(path)) return true;
  return ['/api/projects', '/api/tracks', '/api/releases/', '/api/support/', '/api/openverse/', '/api/freesound/', '/api/imports/'].some((prefix) => path === prefix || (path.startsWith(prefix) && (prefix.endsWith('/') || path[prefix.length] === '/')));
}
