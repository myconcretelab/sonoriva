import { io as connectSocket, type Socket } from 'socket.io-client';
import { registerSocketServer } from '../src/server/socket.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/server/app.js';
import { db, pool } from '../src/server/db/index.js';
import { accountMemberships, accounts, plans, projects, tracks, users } from '../src/server/db/schema.js';
import { config } from '../src/server/config.js';
import { hashPassword } from '../src/server/services/auth.js';
import { insertTrackWithinQuota } from '../src/server/services/accounts.js';
import { memberIsAllowed } from '../src/server/services/memberships.js';

describe('limites des utilisateurs', () => {
  it('conserve le titulaire et applique une limite totale, y compris zéro', () => {
    expect(memberIsAllowed(0, 'owner', 0)).toBe(true);
    expect(memberIsAllowed(0, 'member', 1)).toBe(false);
    expect(memberIsAllowed(2, 'member', 1)).toBe(true);
    expect(memberIsAllowed(2, 'member', 2)).toBe(false);
  });
});

// Run against a dedicated, migrated local database with SONORIVA_INTEGRATION_DB=1.
describe.skipIf(process.env.SONORIVA_INTEGRATION_DB !== '1')('compte multiutilisateur (PostgreSQL)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let socketServer: ReturnType<typeof registerSocketServer>;
  let socketUrl: string;
  let liveSocket: Socket | undefined;
  let ownerId: string;
  let ownerProject: string;
  let memberId: string;
  let memberProject: string;
  let accountId: string;
  let foreignProject: string;
  let cookie = '';
  let requestNumber = 0;
  const email = `owner-${randomUUID()}@example.com`;
  const memberEmail = `member-${randomUUID()}@example.com`;
  const planCode = `test-${randomUUID().slice(0, 8)}`;
  const password = 'integration-password';
  let sourceId: string;
  let copyId: string;
  const storageKey = `test-${randomUUID()}.mp3`;
  const file = () => path.join(config.STORAGE_PATH, storageKey);
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object, session = cookie) => app.inject({ method, url, payload, headers: { cookie: session, 'x-forwarded-for': `192.0.2.${++requestNumber}` } });
  const login = async (address: string) => {
    const response = await call('POST', '/api/auth/login', { email: address, password });
    expect(response.statusCode, response.body).toBe(200);
    cookie = response.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
    return cookie;
  };

  beforeAll(async () => {
    const database = await pool.query('select current_database() as name');
    if (!database.rows[0].name.startsWith('sonoriva_test_')) throw new Error('Une base dédiée sonoriva_test_* est requise.');
    await db.insert(plans).values({ code: planCode, name: 'Test', storageQuotaBytes: 10, maxUsers: 2 });
    const [owner] = await db.insert(users).values({ email, displayName: 'Titulaire', passwordHash: await hashPassword(password) }).returning();
    ownerId = owner.id;
    const [account] = await db.insert(accounts).values({ name: 'Test', planCode, accessStatus: 'active' }).returning();
    accountId = account.id;
    await db.insert(accountMemberships).values({ accountId, userId: ownerId, role: 'owner' });
    const [project] = await db.insert(projects).values({ accountId, userId: ownerId, name: 'Original' }).returning();
    ownerProject = project.id;
    const [foreign] = await db.insert(accounts).values({ name: 'Autre compte', planCode, accessStatus: 'active' }).returning();
    const [foreignP] = await db.insert(projects).values({ accountId: foreign.id, userId: ownerId, name: 'Interdit' }).returning();
    foreignProject = foreignP.id;
    await mkdir(config.STORAGE_PATH, { recursive: true });
    await writeFile(file(), '1234567890');
    const source = await insertTrackWithinQuota(ownerId, { projectId: ownerProject, title: 'Original', originalFilename: 'source.mp3', storageKey, sizeBytes: 10, mimeType: 'audio/mpeg' });
    sourceId = source.id;
    app = await buildApp();
    socketServer = registerSocketServer(app);
    socketUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    await login(email);
  });
  afterAll(async () => { liveSocket?.disconnect(); socketServer?.close(); await app?.close(); await pool.end(); });

  it('crée un membre et refuse de dépasser le forfait', async () => {
    const response = await call('POST', '/api/account/members', { displayName: 'Membre', email: memberEmail, password });
    expect(response.statusCode, response.body).toBe(201);
    memberId = response.json().user.id;
    const [project] = await db.select().from(projects).where(eq(projects.userId, memberId));
    memberProject = project.id;
    expect((await call('POST', '/api/account/members', { displayName: 'Excès', email: 'excess@example.com', password })).statusCode).toBe(403);
    const list = await call('GET', '/api/projects');
    expect(list.json().projects.map((p: { id: string }) => p.id)).toEqual([ownerProject]);
    expect((await call('GET', `/api/projects/${memberProject}`)).statusCode).toBe(404);
  });

  it('copie au quota plein sans doubler le fichier ni le stockage', async () => {
    const response = await call('POST', '/api/account/copy-tracks', { trackIds: [sourceId], projectId: memberProject });
    expect(response.statusCode, response.body).toBe(201);
    copyId = response.json().tracks[0].id;
    expect(response.json().tracks[0].storageKey).toBe(storageKey);
    expect((await call('GET', '/api/account')).json().account.storageUsedBytes).toBe(10);
    await expect(insertTrackWithinQuota(ownerId, { projectId: ownerProject, title: 'Trop', originalFilename: 'more.mp3', storageKey: 'never-written', sizeBytes: 1, mimeType: 'audio/mpeg' })).rejects.toThrow('quota');
    expect((await call('POST', '/api/account/copy-tracks', { trackIds: [sourceId], projectId: foreignProject })).statusCode).toBe(403);
  });

  it('révoque la session précédente et protège les spectacles et les sons', async () => {
    const previous = cookie;
    await login(memberEmail);
    expect((await call('GET', '/api/auth/me', undefined, previous)).statusCode).toBe(401);
    expect((await call('GET', '/api/projects')).json().projects.map((p: { id: string }) => p.id)).toEqual([memberProject]);
    expect((await call('GET', `/api/projects/${ownerProject}`)).statusCode).toBe(404);
    expect((await call('PATCH', `/api/tracks/${sourceId}`, { title: 'Interdit' })).statusCode).toBe(404);
    expect((await call('POST', '/api/account/members', { displayName: 'Interdit', email: 'forbidden@example.com', password })).statusCode).toBe(403);
    const renamed = await call('PATCH', `/api/tracks/${copyId}`, { title: 'Nom personnel' });
    expect(renamed.statusCode, renamed.body).toBe(200);
    const [source] = await db.select().from(tracks).where(eq(tracks.id, sourceId));
    expect(source.title).toBe('Original');
    expect(await readFile(file(), 'utf8')).toBe('1234567890');
  });

  it('notifie et ferme immédiatement le socket de l’ancienne session', async () => {
    liveSocket = connectSocket(socketUrl, { extraHeaders: { cookie }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve, reject) => { liveSocket!.once('connect', resolve); liveSocket!.once('connect_error', reject); });
    const revoked = new Promise<void>((resolve) => liveSocket!.once('session-revoked', resolve));
    await login(email);
    await revoked;
    liveSocket.disconnect();
  });

  it('ne laisse qu’une session après deux connexions concurrentes', async () => {
    const results = await Promise.all([call('POST', '/api/auth/login', { email, password }), call('POST', '/api/auth/login', { email: memberEmail, password })]);
    const responses = await Promise.all(results.map((response) => call('GET', '/api/auth/me', undefined, response.cookies.map((item) => `${item.name}=${item.value}`).join('; '))));
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 401]);
    await login(email);
  });

  it('désactive le partage et les membres excédentaires sans supprimer leurs données', async () => {
    await db.update(plans).set({ maxUsers: 0 }).where(eq(plans.code, planCode));
    expect((await call('GET', '/api/account/library')).statusCode).toBe(403);
    expect((await call('POST', '/api/auth/login', { email: memberEmail, password })).statusCode).toBe(403);
    expect((await call('GET', '/api/auth/me')).statusCode).toBe(200);
    expect((await db.select().from(tracks).where(eq(tracks.id, copyId)))).toHaveLength(1);
    await db.update(plans).set({ maxUsers: 2 }).where(eq(plans.code, planCode));
  });

  it('désactive un membre puis le réactive sans perdre ses sons', async () => {
    expect((await call('PATCH', `/api/account/members/${memberId}`, { disabled: true })).statusCode).toBe(204);
    expect((await call('POST', '/api/auth/login', { email: memberEmail, password })).statusCode).toBe(401);
    expect((await call('PATCH', `/api/account/members/${memberId}`, { disabled: false })).statusCode).toBe(204);
    expect((await db.select().from(tracks).where(eq(tracks.id, copyId)))).toHaveLength(1);
    expect((await call('DELETE', `/api/account/members/${ownerId}`)).statusCode).toBe(403);
  });

  it('conserve le fichier après suppression de l’original, puis supprime la dernière référence', async () => {
    expect((await call('DELETE', `/api/projects/${ownerProject}`)).statusCode).toBe(204);
    expect(await readFile(file(), 'utf8')).toBe('1234567890');
    await login(memberEmail);
    const audio = await call('GET', `/api/tracks/${copyId}/stream`);
    expect(audio.statusCode, audio.body).toBe(200);
    expect(audio.body).toBe('1234567890');
    expect((await call('DELETE', `/api/tracks/${copyId}`)).statusCode).toBe(204);
    await expect(readFile(file())).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('retire un membre et libère sa place dans le forfait', async () => {
    await login(email);
    expect((await call('DELETE', `/api/account/members/${memberId}`)).statusCode).toBe(204);
    expect((await call('GET', '/api/account/members')).json().members).toHaveLength(1);
    expect((await db.select().from(projects).where(eq(projects.id, memberProject)))).toHaveLength(0);
    expect((await call('POST', '/api/auth/login', { email: memberEmail, password })).statusCode).toBe(403);
  });
});
