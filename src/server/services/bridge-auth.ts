import { membershipAccess } from './memberships.js';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { accounts, bridgeDevices, plans, sessions, users, type BridgeDevice } from '../db/schema.js';
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

export async function requireBridgeDevice(request: FastifyRequest, reply: FastifyReply): Promise<BridgeDevice | null> {
  const token = bearerToken(request.headers.authorization);
  if (!token) {
    await reply.code(401).send({ error: 'Jeton SonoRiva Bridge requis.' });
    return null;
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
    await reply.code(401).send({ error: 'Ce bridge n’est pas associé ou a été révoqué.' });
    return null;
  }
  if (!accountCanUseBridge(context)) {
    await reply.code(403).send({ error: 'SonoRiva Bridge est réservé aux forfaits payants actifs.' });
    return null;
  }
  const [active] = await db.select({ id: users.id }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.userId, context.device.userId), gt(sessions.expiresAt, new Date()), isNull(users.disabledAt))).limit(1);
  if (!active || !(await membershipAccess(context.device.userId))) {
    await reply.code(401).send({ error: 'Connectez cet utilisateur pour utiliser son bridge.' });
    return null;
  }
  const now = new Date();
  await db.update(bridgeDevices)
    .set({ lastSeenAt: now, updatedAt: now })
    .where(eq(bridgeDevices.id, context.device.id));
  return { ...context.device, lastSeenAt: now, updatedAt: now };
}
