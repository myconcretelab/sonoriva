import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/server/app.js';
import { db, pool } from '../src/server/db/index.js';
import { accountMemberships, accounts, categories, plans, playlistItems, playlists, projectColors, projects, projectShares, tracks, trackSubcategories, users } from '../src/server/db/schema.js';
import { config } from '../src/server/config.js';
import { hashPassword } from '../src/server/services/auth.js';

// Uses a disposable, migrated database, never a live account.
describe.skipIf(process.env.SONORIVA_INTEGRATION_DB !== '1')('appropriation d’un spectacle (PostgreSQL)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let fred: string, alex: string, source: string, owned: string, copy: string, sourceTrack: string, sourceCategory: string, accountId: string;
  let cookie = '';
  let requests = 0;
  const unique = randomUUID();
  const fredEmail = `fred-${unique}@example.com`, alexEmail = `alex-${unique}@example.com`;
  const planCode = `copy-${unique.slice(0, 8)}`, key = `copy-${unique}.mp3`;
  const password = 'test-appropriation-2026';
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) => app.inject({ method, url, payload, headers: { cookie, 'x-forwarded-for': `192.0.2.${++requests}` } });
  async function login(email: string) {
    const response = await call('POST', '/api/auth/login', { email, password });
    expect(response.statusCode, response.body).toBe(200);
    cookie = response.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
  }
  beforeAll(async () => {
    const database = await pool.query('select current_database() as name');
    if (!database.rows[0].name.startsWith('sonoriva_test_')) throw new Error('Base dédiée sonoriva_test_* requise.');
    await db.insert(plans).values({ code: planCode, name: 'Appropriation', storageQuotaBytes: 10, maxUsers: 2, maxProjects: 2 });
    const [account] = await db.insert(accounts).values({ name: 'Compte partagé', planCode, accessStatus: 'active' }).returning();
    accountId = account.id;
    const hash = await hashPassword(password);
    for (const [name, email, role] of [['Fred', fredEmail, 'owner'], ['Alex', alexEmail, 'member']]) {
      const [user] = await db.insert(users).values({ email, displayName: name, passwordHash: hash }).returning();
      await db.insert(accountMemberships).values({ userId: user.id, accountId, role });
      if (role === 'owner') fred = user.id; else alex = user.id;
    }
    const [trombone] = await db.insert(projects).values({ userId: fred, accountId, name: 'Trombone', leftClickAction: 'fade-in', maxActivePlaybacks: 12, searchShortcut: 'Primary+KeyF' }).returning();
    source = trombone.id;
    const [personal] = await db.insert(projects).values({ userId: alex, accountId, name: 'Personnel' }).returning();
    owned = personal.id;
    const [category] = await db.insert(categories).values({ projectId: source, name: 'Scène', color: '#123456', position: 4 }).returning();
    sourceCategory = category.id;
    const [group] = await db.insert(trackSubcategories).values({ projectId: source, categoryId: category.id, name: 'Groupe', position: 2.5 }).returning();
    await db.insert(projectColors).values({ projectId: source, color: '#123456', position: 3 });
    const media = await db.insert(tracks).values([
      { projectId: source, categoryId: category.id, subcategoryId: group.id, title: 'Note', originalFilename: 'note.mp3', storageKey: key, mimeType: 'audio/mpeg', sizeBytes: 10, volume: .4, loop: true, fadeInMs: 600, tags: ['cuivre'], position: 2 },
      { projectId: source, title: 'Note libre', originalFilename: 'note.mp3', storageKey: key, mimeType: 'audio/mpeg', sizeBytes: 10, position: 1 },
    ]).returning();
    sourceTrack = media[0].id;
    const [playlist] = await db.insert(playlists).values({ projectId: source, categoryId: category.id, name: 'Ouverture', loop: true, random: true, crossfadeMs: 800, gapMs: 150, position: 5 }).returning();
    await db.insert(playlistItems).values(media.concat(media[0]).map((track, position) => ({ playlistId: playlist.id, trackId: track.id, rowIndex: position < 2 ? 0 : 1, position })));
    await db.insert(projectShares).values({ projectId: source, userId: alex });
    await mkdir(config.STORAGE_PATH, { recursive: true });
    await writeFile(path.join(config.STORAGE_PATH, key), '1234567890');
    app = await buildApp();
    await login(alexEmail);
  });
  afterAll(async () => { await app?.close(); await pool.end(); });

  it('refuse un spectacle non partagé, son propre spectacle et un nom vide', async () => {
    expect((await call('POST', `/api/projects/${randomUUID()}/appropriate`, { name: 'Flûte' })).statusCode).toBe(403);
    expect((await call('POST', `/api/projects/${owned}/appropriate`, { name: 'Flûte' })).statusCode).toBe(403);
    expect((await call('POST', `/api/projects/${source}/appropriate`, { name: ' ' })).statusCode).toBe(400);
    expect((await call('PATCH', `/api/projects/${source}/name`, { name: 'Flûte' })).statusCode).toBe(404);
  });

  it('respecte les restrictions d’écriture sans créer de spectacle partiel', async () => {
    await db.update(accounts).set({ accessStatus: 'read_only' }).where(eq(accounts.id, accountId));
    expect((await call('POST', `/api/projects/${source}/appropriate`, { name: 'Flûte' })).statusCode).toBe(403);
    expect(await db.select().from(projects).where(eq(projects.userId, alex))).toHaveLength(1);
    await db.update(accounts).set({ accessStatus: 'active' }).where(eq(accounts.id, accountId));
  });

  it('crée une copie complète et privée au quota plein, sans dépasser la limite lors de deux demandes simultanées', async () => {
    const results = await Promise.all([call('POST', `/api/projects/${source}/appropriate`, { name: 'Flûte' }), call('POST', `/api/projects/${source}/appropriate`, { name: 'Flûte' })]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 403]);
    copy = results.find((r) => r.statusCode === 201)!.json().project.id;
    const detail = (await call('GET', `/api/projects/${copy}`)).json();
    expect(detail.project).toMatchObject({ name: 'Flûte', userId: alex, leftClickAction: 'fade-in', maxActivePlaybacks: 12, searchShortcut: 'Primary+KeyF' });
    expect(detail.categories).toHaveLength(1);
    expect(detail.categories[0]).toMatchObject({ name: 'Scène', color: '#123456', position: 4 });
    expect(detail.categories[0].id).not.toBe(sourceCategory);
    expect(detail.subcategories[0]).toMatchObject({ categoryId: detail.categories[0].id, name: 'Groupe', position: 2.5 });
    expect(detail.colors[0]).toMatchObject({ color: '#123456', position: 3 });
    expect(detail.tracks).toHaveLength(2);
    const note = detail.tracks.find((t: { title: string }) => t.title === 'Note');
    const free = detail.tracks.find((t: { title: string }) => t.title === 'Note libre');
    expect(note).toMatchObject({ storageKey: key, categoryId: detail.categories[0].id, subcategoryId: detail.subcategories[0].id, volume: .4, loop: true, fadeInMs: 600, tags: ['cuivre'] });
    expect(note.id).not.toBe(sourceTrack);
    expect(free).toMatchObject({ categoryId: null, subcategoryId: null });
    expect(detail.playlists[0]).toMatchObject({ name: 'Ouverture', categoryId: detail.categories[0].id, loop: true, random: true, crossfadeMs: 800, gapMs: 150, items: [{ trackId: note.id, rowIndex: 0 }, { trackId: free.id, rowIndex: 0 }, { trackId: note.id, rowIndex: 1 }] });
    expect((await call('GET', `/api/projects/${copy}/sharing`)).json().userIds).toEqual([]);
    expect((await call('GET', '/api/account')).json().account.storageUsedBytes).toBe(10);
    expect((await call('PATCH', `/api/projects/${copy}/name`, { name: 'Flûte solo' })).json().project.name).toBe('Flûte solo');
    await login(fredEmail);
    expect((await call('GET', `/api/projects/${copy}`)).statusCode).toBe(404);
    const original = (await call('GET', `/api/projects/${source}`)).json();
    expect(original.project.name).toBe('Trombone');
    expect(original.tracks).toHaveLength(2);
    expect((await call('GET', `/api/projects/${source}/sharing`)).json().userIds).toEqual([alex]);
  });

  it('conserve la copie après modification, retrait du partage et suppression de Trombone', async () => {
    await call('PATCH', `/api/tracks/${sourceTrack}`, { title: 'Original modifié' });
    expect((await call('PUT', `/api/projects/${source}/sharing`, { userIds: [] })).statusCode).toBe(200);
    await login(alexEmail);
    expect((await call('POST', `/api/projects/${source}/appropriate`, { name: 'Interdit' })).statusCode).toBe(403);
    const detail = (await call('GET', `/api/projects/${copy}`)).json();
    expect(detail.tracks.some((t: { title: string }) => t.title === 'Note')).toBe(true);
    await login(fredEmail);
    expect((await call('DELETE', `/api/projects/${source}`)).statusCode).toBe(204);
    await login(alexEmail);
    expect((await call('GET', `/api/tracks/${detail.tracks[0].id}/stream`)).body).toBe('1234567890');
    expect((await call('DELETE', `/api/projects/${copy}`)).statusCode).toBe(204);
    await expect(readFile(path.join(config.STORAGE_PATH, key))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('s’approprie également un spectacle vide', async () => {
    const [empty] = await db.insert(projects).values({ userId: fred, accountId, name: 'Vide' }).returning();
    await db.insert(projectShares).values({ projectId: empty.id, userId: alex });
    const response = await call('POST', `/api/projects/${empty.id}/appropriate`, { name: 'Mon spectacle' });
    expect(response.statusCode, response.body).toBe(201);
    const detail = (await call('GET', `/api/projects/${response.json().project.id}`)).json();
    expect(detail.tracks).toEqual([]); expect(detail.categories).toEqual([]); expect(detail.playlists).toEqual([]);
  });
});
