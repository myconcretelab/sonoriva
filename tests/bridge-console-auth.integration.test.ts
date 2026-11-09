import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/server/app';
import { db, pool } from '../src/server/db';
import { accountMemberships, accounts, bridgeDevices, plans, projects, sessions, users } from '../src/server/db/schema';
import { hashPassword } from '../src/server/services/auth';
import { createBridgeToken, hashBridgeToken } from '../src/server/services/bridge-auth';

describe.skipIf(process.env.SONORIVA_INTEGRATION_DB !== '1')('authentification de la régie locale (PostgreSQL)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userId: string, accountId: string, projectId: string, deviceId: string;
  let sequence = 0;
  const token = createBridgeToken();
  const unique = randomUUID();
  const call = (url: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', payload?: object) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': `198.51.100.${++sequence}` } });
  beforeAll(async () => {
    if (!(await pool.query('select current_database() as name')).rows[0].name.startsWith('sonoriva_test_')) throw new Error('Base dédiée requise.');
    const code = `bridge-${unique}`;
    await db.insert(plans).values({ code, name: 'Bridge', monthlyPriceCents: 1000, storageQuotaBytes: 1000000, maxUsers: 1, maxProjects: 5 });
    const [account] = await db.insert(accounts).values({ name: 'Bridge', planCode: code, accessStatus: 'active' }).returning(); accountId = account.id;
    const [user] = await db.insert(users).values({ email: `bridge-${unique}@example.com`, displayName: 'Bridge', passwordHash: await hashPassword('bridge-console-2026'), platformRole: 'admin' }).returning(); userId = user.id;
    await db.insert(accountMemberships).values({ accountId, userId, role: 'owner' });
    const [project] = await db.insert(projects).values({ accountId, userId, name: 'Régie' }).returning(); projectId = project.id;
    const [device] = await db.insert(bridgeDevices).values({ accountId, userId, name: 'Bridge', platform: 'macos', tokenHash: hashBridgeToken(token) }).returning(); deviceId = device.id;
    app = await buildApp();
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password: 'bridge-console-2026' } });
    expect(login.statusCode, login.body).toBe(200);
  });
  afterAll(async () => { await app?.close(); await pool.end(); });
  it('autorise les données du spectacle sans cookie et les modifications ordinaires', async () => {
    const identity = await call('/api/auth/me');
    expect(identity.statusCode, identity.body).toBe(200); expect(identity.json().user.id).toBe(userId);
    for (const url of ['/api/account', '/api/projects', `/api/projects/${projectId}`]) { const result = await call(url); expect(result.statusCode, result.body).toBe(200); }
    const result = await call(`/api/projects/${projectId}/categories`, 'POST', { name: 'Locale', color: '#DBEDF7' });
    expect(result.statusCode, result.body).toBe(201);
  });
  it('ne transforme pas un jeton du Bridge en accès administrateur ou facturation', async () => {
    for (const url of ['/api/admin/overview', '/api/account/members']) expect((await call(url)).statusCode).toBe(401);
    for (const url of ['/api/billing/portal', '/api/bridge/pairings']) expect((await call(url, 'POST', {})).statusCode).toBe(401);
    // The public logout route only deletes a cookie session; a bearer token cannot revoke it.
    expect((await call('/api/auth/logout', 'POST')).statusCode).toBe(204);
    expect((await call('/api/auth/me')).statusCode).toBe(200);
  });
  it('refuse les appareils révoqués et les comptes suspendus', async () => {
    await db.update(bridgeDevices).set({ revokedAt: new Date() }).where(eq(bridgeDevices.id, deviceId));
    expect((await call(`/api/projects/${projectId}`)).statusCode).toBe(401);
    await db.update(bridgeDevices).set({ revokedAt: null }).where(eq(bridgeDevices.id, deviceId));
    await db.update(accounts).set({ accessStatus: 'suspended' }).where(eq(accounts.id, accountId));
    expect((await call('/api/auth/me')).statusCode).toBe(401);
    await db.update(accounts).set({ accessStatus: 'active' }).where(eq(accounts.id, accountId));
  });
  it('refuse un compte ambigu et une session expirée', async () => {
    const [other] = await db.insert(accounts).values({ name: 'Autre', planCode: `bridge-${unique}`, accessStatus: 'active' }).returning();
    await db.insert(accountMemberships).values({ accountId: other.id, userId, role: 'owner' });
    expect((await call('/api/auth/me')).statusCode).toBe(401);
    await db.delete(accountMemberships).where(eq(accountMemberships.accountId, other.id));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    expect((await call('/api/auth/me')).statusCode).toBe(401);
  });
});
