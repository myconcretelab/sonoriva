import { randomUUID } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/server/app';
import { db, pool } from '../src/server/db';
import { accountMemberships, accounts, plans, projects, tracks, users } from '../src/server/db/schema';
import { config } from '../src/server/config';
import { hashPassword } from '../src/server/services/auth';

describe.skipIf(process.env.SONORIVA_INTEGRATION_DB !== '1')('synchronisation des sons hors ligne (PostgreSQL)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let projectId: string;
  let trackId: string;
  let cookie = '';
  const unique = randomUUID();
  const email = `offline-${unique}@example.com`;
  let requests = 0;
  const call = (url: string, payload: object) => app.inject({ method: 'PATCH', url, payload, headers: { cookie, 'x-forwarded-for': `192.0.2.${++requests}` } });
  beforeAll(async () => {
    if (!(await pool.query('select current_database() as name')).rows[0].name.startsWith('sonoriva_test_')) throw new Error('Base dédiée requise.');
    const code = `offline-${unique}`;
    await db.insert(plans).values({ code, name: 'Hors ligne', storageQuotaBytes: 100, maxProjects: 2, maxUsers: 1 });
    const [account] = await db.insert(accounts).values({ name: 'Hors ligne', planCode: code, accessStatus: 'active' }).returning();
    const [user] = await db.insert(users).values({ email, displayName: 'Hors ligne', passwordHash: await hashPassword('offline-test-2026') }).returning();
    await db.insert(accountMemberships).values({ accountId: account.id, userId: user.id, role: 'owner' });
    const [project] = await db.insert(projects).values({ userId: user.id, accountId: account.id, name: 'Hors ligne' }).returning();
    projectId = project.id;
    const [track] = await db.insert(tracks).values({ projectId, title: 'Ouverture', originalFilename: 'ouverture.wav', storageKey: `${unique}.wav`, mimeType: 'audio/wav', sizeBytes: 4, volume: 1 }).returning();
    trackId = track.id;
    await mkdir(config.STORAGE_PATH, { recursive: true });
    app = await buildApp();
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'offline-test-2026' } });
    expect(login.statusCode, login.body).toBe(200);
    cookie = login.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  });
  afterAll(async () => { await app?.close(); await pool.end(); });

  it('détecte un conflit sur le même champ sans écraser le serveur', async () => {
    await call(`/api/tracks/${trackId}`, { volume: .8 });
    const result = await call(`/api/tracks/${trackId}`, { volume: .16, offlineBase: { volume: 1 } });
    expect(result.statusCode, result.body).toBe(409);
    expect(result.json().track.volume).toBeCloseTo(.8);
    expect((await db.select().from(tracks).where(eq(tracks.id, trackId)))[0].volume).toBeCloseTo(.8);
  });
  it('préserve les changements distants indépendants et accepte une réponse rejouée', async () => {
    await call(`/api/tracks/${trackId}`, { volume: 1, title: 'Titre modifié ailleurs' });
    const input = { volume: .16, offlineBase: { volume: 1 } };
    for (let i = 0; i < 2; i++) {
      const result = await call(`/api/tracks/${trackId}`, input);
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json().track).toMatchObject({ title: 'Titre modifié ailleurs', volume: .16 });
    }
  });
  it('compare les tags JSON et refuse les versions de départ incomplètes', async () => {
    const accepted = await call(`/api/tracks/${trackId}`, { tags: ['scène'], offlineBase: { tags: [] } });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect((await call(`/api/tracks/${trackId}`, { tags: ['entrée'], offlineBase: { tags: [] } })).statusCode).toBe(409);
    expect((await call(`/api/tracks/${trackId}`, { volume: .3, offlineBase: {} })).statusCode).toBe(400);
  });
  it('importe une seule fois sous le même identifiant, même avec deux requêtes concurrentes', async () => {
    const id = randomUUID();
    const boundary = `test-${unique}`;
    const field = (name: string, value: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
    const body = field('projectId', projectId) + field('title', 'Nouveau son') + field('clientTrackId', id) + field('tags', '')
      + `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="nouveau.wav"\r\nContent-Type: audio/wav\r\n\r\nWAVE\r\n--${boundary}--\r\n`;
    const before = await readdir(config.STORAGE_PATH);
    const upload = () => app.inject({ method: 'POST', url: '/api/tracks/upload', payload: Buffer.from(body), headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-forwarded-for': `192.0.2.${++requests}` } });
    for (const response of await Promise.all([upload(), upload()])) {
      expect(response.statusCode, response.body).toBe(201);
      expect(response.json().track.id).toBe(id);
    }
    expect(await db.select().from(tracks).where(eq(tracks.id, id))).toHaveLength(1);
    expect((await readdir(config.STORAGE_PATH)).length - before.length).toBe(1);
    await call(`/api/tracks/${id}`, { volume: .16 });
    const replay = await upload();
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json().track.volume).toBe(.16);
    expect((await readdir(config.STORAGE_PATH)).length - before.length).toBe(1);
  });
});
