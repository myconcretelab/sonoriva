import { backgroundImageSchema } from '../services/background-image.js';
import { removeUnreferencedFiles } from '../services/shared-files.js';
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { accounts, categories, playlistItems, playlists, projectColors, projects, tracks, trackSubcategories } from '../db/schema.js';
import { requireUser } from '../services/auth.js';
import { sameIds } from '../services/order.js';
import { canAccessProject, ownsProject, projectAccessCondition } from '../services/ownership.js';
import { accountForUser, accountForUserProject } from '../services/accounts.js';
import { playlistRowsAreValid } from '../services/playlist-rows.js';
import { planFeatures, projectLimitReached } from '../services/commercial-plans.js';

const idParams = z.object({ id: z.string().uuid() });
const mouseActionSchema = z.enum(['start', 'crossfade', 'fade-in', 'replace', 'stop', 'none']);
const keyActionSchema = z.enum(['stop-all', 'stop-all-immediate', 'stop-last', 'stop-last-immediate', 'none']);
const keyboardShortcutSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9+]+$/);
const playlistInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().uuid().nullable().default(null),
  color: z.string().toLowerCase().regex(/^#[0-9a-f]{6}$/),
  autostart: z.boolean(),
  loop: z.boolean(),
  random: z.boolean(),
  showNextButton: z.boolean().default(false),
  gapMs: z.number().int().min(0).max(30_000).default(0),
  crossfadeMs: z.number().int().min(0).max(30_000).default(0),
  items: z.array(z.object({ trackId: z.string().uuid(), rowIndex: z.number().int().min(0).max(499) })).min(1).max(500).optional(),
  trackIds: z.array(z.string().uuid()).min(1).max(500).optional(),
}).refine((input) => input.items !== undefined || input.trackIds !== undefined, { message: 'La playlist doit contenir au moins un morceau.' }).transform(({ items, trackIds, ...input }) => ({
  ...input,
  items: items ?? trackIds!.map((trackId, rowIndex) => ({ trackId, rowIndex })),
}));

async function userCanUsePlaylists(userId: string, projectId: string): Promise<boolean> {
  const account = await accountForUserProject(userId, projectId);
  return account ? planFeatures(account.plan).playlists : false;
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const account = await accountForUser(user.id);
    if (!account) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    return {
      projects: await db.select().from(projects).where(and(eq(projects.accountId, account.account.id), projectAccessCondition(user.id))).orderBy(asc(projects.position), asc(projects.createdAt)),
    };
  });

  app.post('/api/projects', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const account = await accountForUser(user.id);
    if (!account) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    const input = z.object({ name: z.string().trim().min(1).max(120) }).parse(request.body);
    const features = planFeatures(account.plan);
    const project = await db.transaction(async (transaction) => {
      await transaction.execute(sql`select ${accounts.id} from ${accounts} where ${accounts.id} = ${account.account.id} for update`);
      const ownerProjects = await transaction.select({ position: projects.position }).from(projects).where(and(eq(projects.accountId, account.account.id), eq(projects.userId, user.id)));
      if (projectLimitReached(features.maxProjects, ownerProjects.length)) return null;
      const position = Math.max(-1, ...ownerProjects.map((ownerProject) => ownerProject.position)) + 1;
      const [created] = await transaction.insert(projects).values({ accountId: account.account.id, userId: user.id, name: input.name, position }).returning();
      return created;
    });
    if (!project) {
      return reply.code(403).send({ error: `Votre forfait est limité à ${features.maxProjects} spectacle${features.maxProjects === 1 ? '' : 's'}.` });
    }
    return reply.code(201).send({ project });
  });

  app.patch('/api/projects/reorder', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const account = await accountForUser(user.id);
    if (!account) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    const input = z.object({ projectIds: z.array(z.string().uuid()).min(1).max(500) }).parse(request.body);
    const ownerProjects = await db.select().from(projects).where(and(eq(projects.accountId, account.account.id), eq(projects.userId, user.id)));
    if (!sameIds(input.projectIds, ownerProjects.map((project) => project.id))) {
      return reply.code(400).send({ error: 'Ordre des spectacles invalide.' });
    }
    await db.transaction(async (transaction) => {
      for (const [position, projectId] of input.projectIds.entries()) {
        await transaction.update(projects).set({ position, updatedAt: new Date() }).where(eq(projects.id, projectId));
      }
    });
    const reordered = await db.select().from(projects).where(and(eq(projects.accountId, account.account.id), projectAccessCondition(user.id))).orderBy(asc(projects.position), asc(projects.createdAt));
    return { projects: reordered };
  });

  app.get('/api/projects/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = idParams.parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    const [colors, savedPlaylists, savedPlaylistItems, projectCategories, projectSubcategories, projectTracks] = await Promise.all([
      db.select().from(projectColors).where(eq(projectColors.projectId, id)).orderBy(asc(projectColors.position)),
      db.select().from(playlists).where(eq(playlists.projectId, id)).orderBy(asc(playlists.position), asc(playlists.createdAt)),
      db.select({ playlistId: playlistItems.playlistId, trackId: playlistItems.trackId, rowIndex: playlistItems.rowIndex }).from(playlistItems)
        .innerJoin(playlists, eq(playlistItems.playlistId, playlists.id)).where(eq(playlists.projectId, id)).orderBy(asc(playlistItems.position)),
      db.select().from(categories).where(eq(categories.projectId, id)).orderBy(asc(categories.position)),
      db.select().from(trackSubcategories).where(eq(trackSubcategories.projectId, id)).orderBy(asc(trackSubcategories.position), asc(trackSubcategories.createdAt)),
      db.select().from(tracks).where(eq(tracks.projectId, id)).orderBy(asc(tracks.position), asc(tracks.createdAt)),
    ]);
    return {
      project,
      colors,
      playlists: savedPlaylists.map((playlist) => {
        const items = savedPlaylistItems.filter((item) => item.playlistId === playlist.id).map(({ trackId, rowIndex }) => ({ trackId, rowIndex }));
        return { ...playlist, trackIds: items.map((item) => item.trackId), items };
      }),
      categories: projectCategories,
      subcategories: projectSubcategories,
      tracks: projectTracks,
    };
  });

  app.patch('/api/projects/:id/mouse-actions', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = idParams.parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const input = z.object({
      leftClickAction: mouseActionSchema.optional(),
      rightClickAction: mouseActionSchema.optional(),
      keyboardAction: mouseActionSchema.optional(),
      escapeKeyAction: keyActionSchema.optional(),
      backspaceKeyAction: keyActionSchema.optional(),
      shiftBackspaceKeyAction: keyActionSchema.optional(),
      spaceKeyAction: keyActionSchema.optional(),
      nextCategoryShortcut: keyboardShortcutSchema.optional(),
      previousCategoryShortcut: keyboardShortcutSchema.optional(),
      startTrackShortcut: keyboardShortcutSchema.optional(),
      crossfadeTrackShortcut: keyboardShortcutSchema.optional(),
      loadCategoryShortcut: keyboardShortcutSchema.optional(),
      secondaryOutputHoldShortcut: keyboardShortcutSchema.optional(),
      toggleOutputShortcut: keyboardShortcutSchema.optional(),
      masterVolumeUpShortcut: keyboardShortcutSchema.optional(),
      masterVolumeUpFastShortcut: keyboardShortcutSchema.optional(),
      masterVolumeDownShortcut: keyboardShortcutSchema.optional(),
      masterVolumeDownFastShortcut: keyboardShortcutSchema.optional(),
      quickLaunchShortcut: keyboardShortcutSchema.optional(),
      searchShortcut: keyboardShortcutSchema.optional(),
      maxPlaylistGroupSize: z.number().int().min(2).max(8).optional(),
      maxActivePlaybacks: z.number().int().min(1).max(16).optional(),
      compactPlaybackThreshold: z.number().int().min(1).max(16).optional(),
    }).refine((value) => Object.keys(value).length > 0, { message: 'Sélectionnez une action.' }).parse(request.body);
    if (input.maxPlaylistGroupSize !== undefined && !(await userCanUsePlaylists(user.id, id))) {
      return reply.code(403).send({ error: 'Les playlists ne sont pas incluses dans votre forfait.' });
    }
    if (input.maxPlaylistGroupSize !== undefined) {
      const savedItems = await db.select({ playlistId: playlistItems.playlistId, rowIndex: playlistItems.rowIndex }).from(playlistItems)
        .innerJoin(playlists, eq(playlistItems.playlistId, playlists.id)).where(eq(playlists.projectId, id));
      const groupCounts = new Map<string, number>();
      for (const item of savedItems) {
        const key = `${item.playlistId}:${item.rowIndex}`;
        groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
      }
      if ([...groupCounts.values()].some((count) => count > input.maxPlaylistGroupSize!)) {
        return reply.code(400).send({ error: 'Une playlist enregistrée contient déjà une rangée plus grande que cette limite.' });
      }
    }
    const [project] = await db.update(projects).set({ ...input, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    return { project };
  });

  app.delete('/api/projects/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = idParams.parse(request.params);
    if (!(await ownsProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const account = await accountForUser(user.id);
    if (!account) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    const projectTracks = await db.transaction(async (transaction) => {
      await transaction.execute(sql`select id from accounts where id = ${account.account.id} for update`);
      const files = await transaction.select({ storageKey: tracks.storageKey }).from(tracks).where(eq(tracks.projectId, id));
      await transaction.delete(projects).where(and(eq(projects.id, id), and(eq(projects.accountId, account.account.id), eq(projects.userId, user.id))));
      const remaining = await transaction.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.accountId, account.account.id), eq(projects.userId, user.id))).orderBy(asc(projects.position), asc(projects.createdAt));
      for (const [position, project] of remaining.entries()) {
        await transaction.update(projects).set({ position }).where(eq(projects.id, project.id));
      }
      return files;
    });
    await removeUnreferencedFiles(projectTracks.map((track) => track.storageKey));
    return reply.code(204).send();
  });

  app.post('/api/projects/:id/colors', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = idParams.parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const input = z.object({ color: z.string().toLowerCase().regex(/^#[0-9a-f]{6}$/) }).parse(request.body);
    const existingColors = await db.select().from(projectColors).where(eq(projectColors.projectId, id)).orderBy(asc(projectColors.position));
    const existing = existingColors.find((item) => item.color.toLowerCase() === input.color);
    if (existing) return { projectColor: existing };
    if (existingColors.length >= 48) return reply.code(400).send({ error: 'La palette est limitée à 48 couleurs.' });
    const position = Math.max(-1, ...existingColors.map((item) => item.position)) + 1;
    const [projectColor] = await db.insert(projectColors).values({ projectId: id, color: input.color, position }).returning();
    return reply.code(201).send({ projectColor });
  });

  app.patch('/api/projects/:id/colors/reorder', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = idParams.parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const input = z.object({ colorIds: z.array(z.string().uuid()).max(48) }).parse(request.body);
    const colors = await db.select().from(projectColors).where(eq(projectColors.projectId, id));
    if (!sameIds(input.colorIds, colors.map((item) => item.id))) {
      return reply.code(400).send({ error: 'Ordre des couleurs invalide.' });
    }
    await db.transaction(async (transaction) => {
      for (const [position, colorId] of input.colorIds.entries()) {
        await transaction.update(projectColors).set({ position }).where(and(eq(projectColors.id, colorId), eq(projectColors.projectId, id)));
      }
    });
    const reordered = await db.select().from(projectColors).where(eq(projectColors.projectId, id)).orderBy(asc(projectColors.position));
    return { colors: reordered };
  });

  app.delete('/api/projects/:id/colors/:colorId', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id, colorId } = z.object({ id: z.string().uuid(), colorId: z.string().uuid() }).parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const deleted = await db.delete(projectColors).where(and(eq(projectColors.id, colorId), eq(projectColors.projectId, id))).returning({ id: projectColors.id });
    if (deleted.length === 0) return reply.code(404).send({ error: 'Couleur introuvable.' });
    const remaining = await db.select().from(projectColors).where(eq(projectColors.projectId, id)).orderBy(asc(projectColors.position));
    await db.transaction(async (transaction) => {
      for (const [position, item] of remaining.entries()) {
        await transaction.update(projectColors).set({ position }).where(eq(projectColors.id, item.id));
      }
    });
    return reply.code(204).send();
  });

  app.post('/api/projects/:id/subcategories', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = idParams.parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const input = z.object({
      name: z.string().trim().min(1).max(80),
      categoryId: z.string().uuid().nullable(),
      color: z.string().toLowerCase().regex(/^#[0-9a-f]{6}$/),
      trackIds: z.array(z.string().uuid()).max(100).default([]),
    }).parse(request.body);
    if (input.categoryId) {
      const [category] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.projectId, id))).limit(1);
      if (!category) return reply.code(400).send({ error: 'Catégorie parente invalide.' });
    }
    const uniqueTrackIds = [...new Set(input.trackIds)];
    const groupedTracks = uniqueTrackIds.length > 0
      ? await db.select().from(tracks).where(and(eq(tracks.projectId, id), inArray(tracks.id, uniqueTrackIds)))
      : [];
    if (groupedTracks.length !== uniqueTrackIds.length) return reply.code(400).send({ error: 'Le groupe contient un morceau invalide.' });
    const [projectTracks, projectGroups, projectPlaylists] = await Promise.all([
      db.select({ position: tracks.position }).from(tracks).where(eq(tracks.projectId, id)),
      db.select({ position: trackSubcategories.position }).from(trackSubcategories).where(eq(trackSubcategories.projectId, id)),
      db.select({ position: playlists.position }).from(playlists).where(eq(playlists.projectId, id)),
    ]);
    const position = groupedTracks.length > 0
      ? Math.min(...groupedTracks.map((track) => track.position))
      : Math.max(-1, ...projectTracks.map((track) => track.position), ...projectGroups.map((group) => group.position), ...projectPlaylists.map((playlist) => playlist.position)) + 1;
    const result = await db.transaction(async (transaction) => {
      const [subcategory] = await transaction.insert(trackSubcategories).values({ projectId: id, categoryId: input.categoryId, name: input.name, color: input.color, position }).returning();
      if (uniqueTrackIds.length > 0) {
        await transaction.update(tracks).set({ categoryId: input.categoryId, subcategoryId: subcategory.id }).where(and(eq(tracks.projectId, id), inArray(tracks.id, uniqueTrackIds)));
      }
      const updatedTracks = uniqueTrackIds.length > 0
        ? await transaction.select().from(tracks).where(and(eq(tracks.projectId, id), inArray(tracks.id, uniqueTrackIds))).orderBy(asc(tracks.position), asc(tracks.createdAt))
        : [];
      return { subcategory, tracks: updatedTracks };
    });
    return reply.code(201).send(result);
  });

  app.patch('/api/projects/:id/subcategories/:subcategoryId', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id, subcategoryId } = z.object({ id: z.string().uuid(), subcategoryId: z.string().uuid() }).parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const input = z.object({
      name: z.string().trim().min(1).max(80).optional(),
      categoryId: z.string().uuid().nullable().optional(),
      color: z.string().toLowerCase().regex(/^#[0-9a-f]{6}$/).optional(),
      position: z.number().finite().min(-1_000_000).max(1_000_000).optional(),
    }).refine((value) => Object.keys(value).length > 0, { message: 'Aucune modification fournie.' }).parse(request.body);
    const [existing] = await db.select().from(trackSubcategories).where(and(eq(trackSubcategories.id, subcategoryId), eq(trackSubcategories.projectId, id))).limit(1);
    if (!existing) return reply.code(404).send({ error: 'Sous-catégorie introuvable.' });
    if (input.categoryId) {
      const [category] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.projectId, id))).limit(1);
      if (!category) return reply.code(400).send({ error: 'Catégorie parente invalide.' });
    }
    const result = await db.transaction(async (transaction) => {
      const [subcategory] = await transaction.update(trackSubcategories).set({ ...input, updatedAt: new Date() }).where(eq(trackSubcategories.id, subcategoryId)).returning();
      if (input.categoryId !== undefined) await transaction.update(tracks).set({ categoryId: input.categoryId }).where(eq(tracks.subcategoryId, subcategoryId));
      const updatedTracks = await transaction.select().from(tracks).where(eq(tracks.subcategoryId, subcategoryId)).orderBy(asc(tracks.position), asc(tracks.createdAt));
      return { subcategory, tracks: updatedTracks };
    });
    return result;
  });

  app.delete('/api/projects/:id/subcategories/:subcategoryId', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id, subcategoryId } = z.object({ id: z.string().uuid(), subcategoryId: z.string().uuid() }).parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const result = await db.transaction(async (transaction) => {
      const memberTracks = await transaction.update(tracks).set({ subcategoryId: null }).where(and(eq(tracks.projectId, id), eq(tracks.subcategoryId, subcategoryId))).returning();
      const deleted = await transaction.delete(trackSubcategories).where(and(eq(trackSubcategories.id, subcategoryId), eq(trackSubcategories.projectId, id))).returning({ id: trackSubcategories.id });
      return { deleted, tracks: memberTracks };
    });
    if (result.deleted.length === 0) return reply.code(404).send({ error: 'Sous-catégorie introuvable.' });
    return { tracks: result.tracks };
  });

  app.patch('/api/projects/:id/tracks/:trackId/subcategory', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id, trackId } = z.object({ id: z.string().uuid(), trackId: z.string().uuid() }).parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const { subcategoryId } = z.object({ subcategoryId: z.string().uuid().nullable() }).parse(request.body);
    const [track] = await db.select().from(tracks).where(and(eq(tracks.id, trackId), eq(tracks.projectId, id))).limit(1);
    if (!track) return reply.code(404).send({ error: 'Morceau introuvable.' });
    const [subcategory] = subcategoryId
      ? await db.select().from(trackSubcategories).where(and(eq(trackSubcategories.id, subcategoryId), eq(trackSubcategories.projectId, id))).limit(1)
      : [undefined];
    if (subcategoryId && !subcategory) return reply.code(400).send({ error: 'Sous-catégorie invalide.' });
    const [updated] = await db.update(tracks).set({ subcategoryId, ...(subcategory ? { categoryId: subcategory.categoryId } : {}) }).where(eq(tracks.id, trackId)).returning();
    return { track: updated };
  });

  app.post('/api/projects/:id/playlists', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = idParams.parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    if (!(await userCanUsePlaylists(user.id, id))) return reply.code(403).send({ error: 'Les playlists ne sont pas incluses dans votre forfait.' });
    const input = playlistInputSchema.parse(request.body);
    if (input.categoryId) {
      const [category] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.projectId, id))).limit(1);
      if (!category) return reply.code(400).send({ error: 'Catégorie de playlist invalide.' });
    }
    const [project] = await db.select({ maxPlaylistGroupSize: projects.maxPlaylistGroupSize }).from(projects).where(eq(projects.id, id)).limit(1);
    if (!playlistRowsAreValid(input.items, project?.maxPlaylistGroupSize ?? 4)) return reply.code(400).send({ error: 'Composition des rangées de playlist invalide.' });
    const projectTracks = await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.projectId, id));
    const projectTrackIds = new Set(projectTracks.map((track) => track.id));
    if (!input.items.every((item) => projectTrackIds.has(item.trackId))) return reply.code(400).send({ error: 'La playlist contient un morceau invalide.' });
    const [existingPlaylists, existingTracks] = await Promise.all([
      db.select({ position: playlists.position }).from(playlists).where(eq(playlists.projectId, id)),
      db.select({ position: tracks.position }).from(tracks).where(eq(tracks.projectId, id)),
    ]);
    const position = Math.max(-1, ...existingPlaylists.map((playlist) => playlist.position), ...existingTracks.map((track) => track.position)) + 1;
    const playlist = await db.transaction(async (transaction) => {
      const [created] = await transaction.insert(playlists).values({ projectId: id, categoryId: input.categoryId, name: input.name, color: input.color, autostart: input.autostart, loop: input.loop, random: input.random, showNextButton: input.showNextButton, gapMs: input.gapMs, crossfadeMs: input.crossfadeMs, position }).returning();
      await transaction.insert(playlistItems).values(input.items.map((item, itemPosition) => ({ playlistId: created.id, trackId: item.trackId, position: itemPosition, rowIndex: item.rowIndex })));
      return { ...created, trackIds: input.items.map((item) => item.trackId), items: input.items };
    });
    return reply.code(201).send({ playlist });
  });

  app.patch('/api/projects/:id/playlists/:playlistId/position', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id, playlistId } = z.object({ id: z.string().uuid(), playlistId: z.string().uuid() }).parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    if (!(await userCanUsePlaylists(user.id, id))) return reply.code(403).send({ error: 'Les playlists ne sont pas incluses dans votre forfait.' });
    const input = z.object({ position: z.number().finite().min(-1_000_000).max(1_000_000), categoryId: z.string().uuid().nullable().optional() }).parse(request.body);
    if (input.categoryId) {
      const [category] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.projectId, id))).limit(1);
      if (!category) return reply.code(400).send({ error: 'Catégorie de playlist invalide.' });
    }
    const [playlist] = await db.update(playlists).set({ position: input.position, ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}), updatedAt: new Date() }).where(and(eq(playlists.id, playlistId), eq(playlists.projectId, id))).returning();
    if (!playlist) return reply.code(404).send({ error: 'Playlist introuvable.' });
    return { playlist };
  });

  app.patch('/api/projects/:id/playlists/:playlistId', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id, playlistId } = z.object({ id: z.string().uuid(), playlistId: z.string().uuid() }).parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    if (!(await userCanUsePlaylists(user.id, id))) return reply.code(403).send({ error: 'Les playlists ne sont pas incluses dans votre forfait.' });
    const input = playlistInputSchema.parse(request.body);
    const [existing] = await db.select().from(playlists).where(and(eq(playlists.id, playlistId), eq(playlists.projectId, id))).limit(1);
    if (!existing) return reply.code(404).send({ error: 'Playlist introuvable.' });
    if (input.categoryId) {
      const [category] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.projectId, id))).limit(1);
      if (!category) return reply.code(400).send({ error: 'Catégorie de playlist invalide.' });
    }
    const [project] = await db.select({ maxPlaylistGroupSize: projects.maxPlaylistGroupSize }).from(projects).where(eq(projects.id, id)).limit(1);
    if (!playlistRowsAreValid(input.items, project?.maxPlaylistGroupSize ?? 4)) return reply.code(400).send({ error: 'Composition des rangées de playlist invalide.' });
    const projectTracks = await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.projectId, id));
    const projectTrackIds = new Set(projectTracks.map((track) => track.id));
    if (!input.items.every((item) => projectTrackIds.has(item.trackId))) return reply.code(400).send({ error: 'La playlist contient un morceau invalide.' });
    const playlist = await db.transaction(async (transaction) => {
      const [updated] = await transaction.update(playlists).set({ categoryId: input.categoryId, name: input.name, color: input.color, autostart: input.autostart, loop: input.loop, random: input.random, showNextButton: input.showNextButton, gapMs: input.gapMs, crossfadeMs: input.crossfadeMs, updatedAt: new Date() }).where(eq(playlists.id, playlistId)).returning();
      await transaction.delete(playlistItems).where(eq(playlistItems.playlistId, playlistId));
      await transaction.insert(playlistItems).values(input.items.map((item, itemPosition) => ({ playlistId, trackId: item.trackId, position: itemPosition, rowIndex: item.rowIndex })));
      return { ...updated, trackIds: input.items.map((item) => item.trackId), items: input.items };
    });
    return { playlist };
  });

  app.delete('/api/projects/:id/playlists/:playlistId', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id, playlistId } = z.object({ id: z.string().uuid(), playlistId: z.string().uuid() }).parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    if (!(await userCanUsePlaylists(user.id, id))) return reply.code(403).send({ error: 'Les playlists ne sont pas incluses dans votre forfait.' });
    const deleted = await db.delete(playlists).where(and(eq(playlists.id, playlistId), eq(playlists.projectId, id))).returning({ id: playlists.id });
    if (deleted.length === 0) return reply.code(404).send({ error: 'Playlist introuvable.' });
    return reply.code(204).send();
  });

  app.post('/api/projects/:id/categories', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = idParams.parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const input = z.object({
      name: z.string().trim().min(1).max(80),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8b5cf6'),
      position: z.number().int().min(0).optional(),
    }).parse(request.body);
    const projectCategories = await db.select({ position: categories.position }).from(categories).where(eq(categories.projectId, id));
    const position = input.position ?? Math.max(-1, ...projectCategories.map((category) => category.position)) + 1;
    const [category] = await db.insert(categories).values({ projectId: id, ...input, position }).returning();
    return reply.code(201).send({ category });
  });

  app.patch('/api/projects/:id/categories/reorder', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = idParams.parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const input = z.object({ categoryIds: z.array(z.string().uuid()).max(500) }).parse(request.body);
    const projectCategories = await db.select().from(categories).where(eq(categories.projectId, id));
    if (!sameIds(input.categoryIds, projectCategories.map((category) => category.id))) {
      return reply.code(400).send({ error: 'Ordre des catégories invalide.' });
    }
    await db.transaction(async (transaction) => {
      for (const [position, categoryId] of input.categoryIds.entries()) {
        await transaction.update(categories).set({ position }).where(and(eq(categories.id, categoryId), eq(categories.projectId, id)));
      }
    });
    const reordered = await db.select().from(categories).where(eq(categories.projectId, id)).orderBy(asc(categories.position));
    return { categories: reordered };
  });

  app.patch('/api/projects/:id/categories/:categoryId', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id, categoryId } = z.object({ id: z.string().uuid(), categoryId: z.string().uuid() }).parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const input = z.object({ backgroundImage: backgroundImageSchema }).parse(request.body);
    const [category] = await db.update(categories).set(input)
      .where(and(eq(categories.id, categoryId), eq(categories.projectId, id))).returning();
    if (!category) return reply.code(404).send({ error: 'Catégorie introuvable.' });
    return { category };
  });

  app.delete('/api/projects/:id/categories/:categoryId', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id, categoryId } = z.object({ id: z.string().uuid(), categoryId: z.string().uuid() }).parse(request.params);
    if (!(await canAccessProject(user.id, id))) return reply.code(404).send({ error: 'Projet introuvable.' });
    const [category] = await db.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.projectId, id))).limit(1);
    if (!category) return reply.code(404).send({ error: 'Catégorie introuvable.' });
    await db.transaction(async (transaction) => {
      await transaction.delete(categories).where(and(eq(categories.id, categoryId), eq(categories.projectId, id)));
      const remaining = await transaction.select({ id: categories.id }).from(categories)
        .where(eq(categories.projectId, id)).orderBy(asc(categories.position));
      for (const [position, item] of remaining.entries()) {
        await transaction.update(categories).set({ position }).where(eq(categories.id, item.id));
      }
    });
    return reply.code(204).send();
  });
}
