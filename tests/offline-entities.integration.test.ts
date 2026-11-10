import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/server/app';
import { db, pool } from '../src/server/db';
import { accountMemberships, accounts, categories, plans, projects, tracks, trackSubcategories, users } from '../src/server/db/schema';
import { hashPassword } from '../src/server/services/auth';

describe.skipIf(process.env.SONORIVA_INTEGRATION_DB !== '1')('organisation hors ligne (PostgreSQL)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>, projectId: string, userId: string, trackId: string, cookie = '';
  const unique = randomUUID();
  let requests = 0;
  const call = (kind: string, id: string, base: unknown, desired: unknown, extra = {}) => app.inject({ method: 'POST', url: `/api/projects/${projectId}/offline/${kind}/${id}`, payload: { actorId: userId, base, desired, ...extra }, headers: { cookie, 'x-forwarded-for': `192.0.2.${++requests}` } });
  const category = (id = randomUUID()) => ({ id, projectId, name: 'Scène', color: '#123456', position: 0, backgroundImage: null });
  const playlist = (id = randomUUID()) => ({ id, projectId, name: 'Suite', color: '#123456', position: 0, categoryId: null, autostart: false, loop: true, random: false, showNextButton: true, gapMs: 10, crossfadeMs: 200, soundboardBehavior: 'continue', items: [{ trackId, rowIndex: 0 }] });
  beforeAll(async () => {
    if (!(await pool.query('select current_database() as name')).rows[0].name.startsWith('sonoriva_test_')) throw new Error('Base dédiée requise.');
    const code = `entities-${unique}`;
    await db.insert(plans).values({ code, name: 'Organisation', storageQuotaBytes: 100, maxProjects: 2, maxUsers: 1, playlistsEnabled: true });
    const [account] = await db.insert(accounts).values({ name: 'Organisation', planCode: code, accessStatus: 'active' }).returning();
    const email = `entities-${unique}@example.com`;
    const [user] = await db.insert(users).values({ email, displayName: 'Organisation', passwordHash: await hashPassword('entities-test-2026') }).returning();
    userId = user.id;
    await db.insert(accountMemberships).values({ accountId: account.id, userId, role: 'owner' });
    const [project] = await db.insert(projects).values({ userId, accountId: account.id, name: 'Organisation' }).returning(); projectId = project.id;
    const [track] = await db.insert(tracks).values({ projectId, title: 'Son', originalFilename: 'son.wav', storageKey: `${unique}.wav`, mimeType: 'audio/wav', sizeBytes: 4 }).returning(); trackId = track.id;
    app = await buildApp();
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'entities-test-2026' } });
    expect(login.statusCode, login.body).toBe(200); cookie = login.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  });
  afterAll(async () => { await app?.close(); await pool.end(); });

  it('crée une seule catégorie lors de requêtes concurrentes et rejouées', async () => {
    const input = category();
    for (const response of await Promise.all([call('category', input.id, null, input), call('category', input.id, null, input)])) expect(response.statusCode, response.body).toBe(200);
    expect(await db.select().from(categories).where(eq(categories.id, input.id))).toHaveLength(1);
  });
  it('fusionne les champs indépendants et signale un conflit sur le même champ', async () => {
    const base = category(); await call('category', base.id, null, base);
    await db.update(categories).set({ color: '#abcdef' }).where(eq(categories.id, base.id));
    const desired = { ...base, name: 'Locale' };
    for (let i = 0; i < 2; i++) {
      const response = await call('category', base.id, base, desired);
      expect(response.statusCode, response.body).toBe(200); expect(response.json().entity).toMatchObject({ name: 'Locale', color: '#abcdef' });
    }
    await db.update(categories).set({ name: 'Distant' }).where(eq(categories.id, base.id));
    const conflict = await call('category', base.id, base, desired);
    expect(conflict.statusCode).toBe(409); expect(conflict.json().entity.name).toBe('Distant');
  });
  it('enregistre la composition et les options de playlist sans dupliquer les éléments', async () => {
    const input = playlist();
    for (let i = 0; i < 2; i++) {
      const response = await call('playlist', input.id, null, input);
      expect(response.statusCode, response.body).toBe(200); expect(response.json().entity).toMatchObject(input);
    }
    const changed = { ...input, gapMs: 300 };
    expect((await call('playlist', input.id, input, changed)).json().entity.gapMs).toBe(300);
    expect((await call('playlist', input.id, changed, null)).statusCode).toBe(200);
    const replay = await call('playlist', input.id, null, input);
    expect(replay.statusCode).toBe(409); expect(replay.json().entity).toBeNull();
  });
  it('annule une création avant sa réception et refuse les créations retardées', async () => {
    const input = category();
    expect((await call('category', input.id, input, null, { references: { tracks: [], subcategories: [], playlists: [] } })).statusCode).toBe(200);
    expect((await call('category', input.id, null, input)).statusCode).toBe(409);
    expect(await db.select().from(categories).where(eq(categories.id, input.id))).toHaveLength(0);
  });
  it('protège une catégorie dont le contenu a changé puis conserve les sons lors de la suppression confirmée', async () => {
    const input = category(); await call('category', input.id, null, input);
    const [group] = await db.insert(trackSubcategories).values({ projectId, categoryId: input.id, name: 'Groupe', color: '#123456' }).returning();
    await db.update(tracks).set({ categoryId: input.id, subcategoryId: group.id }).where(eq(tracks.id, trackId));
    const conflict = await call('category', input.id, input, null, { references: { tracks: [], subcategories: [], playlists: [] } });
    expect(conflict.statusCode, conflict.body).toBe(409);
    const removed = await call('category', input.id, input, null, { references: conflict.json().references });
    expect(removed.statusCode, removed.body).toBe(200);
    expect((await db.select().from(tracks).where(eq(tracks.id, trackId)))[0]).toMatchObject({ categoryId: null, subcategoryId: null });
    expect(await db.select().from(trackSubcategories).where(eq(trackSubcategories.id, group.id))).toHaveLength(0);
  });
  it('refuse les références invalides, les rangées invalides et les sessions qui ont changé', async () => {
    const input = playlist();
    expect((await call('playlist', input.id, null, { ...input, items: [{ trackId: randomUUID(), rowIndex: 0 }] })).statusCode).toBe(400);
    expect((await call('playlist', input.id, null, { ...input, items: [{ trackId, rowIndex: 2 }] })).statusCode).toBe(400);
    expect((await call('playlist', input.id, null, { ...input, categoryId: randomUUID() })).statusCode).toBe(400);
    const actor = await call('playlist', input.id, null, input, { actorId: randomUUID() });
    expect(actor.statusCode).toBe(403); expect(actor.json().reason).toBe('actor-changed');
  });
  it('respecte les suppressions faites par une ancienne interface', async () => {
    const input = category(); await call('category', input.id, null, input);
    const removed = await app.inject({ method: 'DELETE', url: `/api/projects/${projectId}/categories/${input.id}`, headers: { cookie, 'x-forwarded-for': `192.0.2.${++requests}` } });
    expect(removed.statusCode, removed.body).toBe(204);
    expect((await call('category', input.id, null, input)).statusCode).toBe(409);
  });
});
