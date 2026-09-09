import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { accountMemberships, categories, projects, tracks, trackSubcategories } from '../db/schema.js';
import { DemoUploadError, insertTrackWithinQuota } from '../services/accounts.js';
import { requireUser } from '../services/auth.js';
import { demoLimitsForUser } from '../services/demo.js';
import { ownsProject } from '../services/ownership.js';
import { isAllowedOpenverseAudioUrl } from '../services/openverse.js';
import { parseByteRange } from '../services/range.js';
import { reorderTracks } from '../services/reorder.js';
import { applyTrackTagChange, batchTrackLocationUpdate } from '../services/track-batch.js';

const acceptedMimeTypes = new Set([
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/ogg', 'audio/flac',
  'audio/x-flac', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/x-aac', 'application/ogg',
]);
const acceptedExtensions = new Set(['.mp4', '.webm', '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac']);
const maxAudioBytes = 250 * 1024 * 1024;
const trackTagSchema = z.string().trim()
  .transform((tag) => tag.replace(/^#+/, '').replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(40));
const trackTagsSchema = z.array(trackTagSchema).max(30).transform((tags) => {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLocaleLowerCase('fr');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

const importedMetadataSchema = z.object({
  projectId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  durationMs: z.coerce.number().int().positive().optional(),
  startTimeMs: z.coerce.number().int().min(0).default(0),
  endTimeMs: z.coerce.number().int().positive().optional(),
  fadeInMs: z.coerce.number().int().min(0).max(60_000).default(0),
  fadeOutMs: z.coerce.number().int().min(0).max(60_000).default(400),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  tags: z.preprocess((value) => typeof value === 'string' ? value.split(',') : value, trackTagsSchema).default([]),
  description: z.string().max(5_000).optional(),
  copyrightText: z.string().max(20_000).optional(),
  sourceUrl: z.string().url().optional(),
  sourceId: z.string().max(200).optional(),
  position: z.coerce.number().int().min(0).default(0),
});

function extensionFor(filename: string): string {
  const extension = path.extname(filename).toLowerCase().replace(/[^.a-z0-9]/g, '');
  return extension.slice(0, 8) || '.audio';
}

function isAcceptedAudio(mimeType: string, filename: string): boolean {
  return acceptedMimeTypes.has(mimeType) || (mimeType === 'application/octet-stream' && acceptedExtensions.has(path.extname(filename).toLowerCase()));
}

async function ownedTrack(userId: string, trackId: string) {
  const [row] = await db.select({ track: tracks }).from(tracks)
    .innerJoin(projects, eq(tracks.projectId, projects.id))
    .innerJoin(accountMemberships, eq(accountMemberships.accountId, projects.accountId))
    .where(and(eq(tracks.id, trackId), eq(accountMemberships.userId, userId))).limit(1);
  return row?.track;
}

async function categoryBelongsToProject(categoryId: string, projectId: string): Promise<boolean> {
  const [category] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.projectId, projectId))).limit(1);
  return Boolean(category);
}

async function subcategoryForProject(subcategoryId: string, projectId: string) {
  const [subcategory] = await db.select().from(trackSubcategories)
    .where(and(eq(trackSubcategories.id, subcategoryId), eq(trackSubcategories.projectId, projectId))).limit(1);
  return subcategory;
}

export async function trackRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/tracks/upload', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const parts = request.parts();
    const fields: Record<string, string> = {};
    let uploaded: { key: string; originalFilename: string; mimeType: string; size: number } | undefined;
    let stagedKey: string | undefined;
    const demoLimits = user.isDemo ? await demoLimitsForUser(user.id) : null;
    const userMaxAudioBytes = demoLimits?.maxFileBytes ?? maxAudioBytes;
    await mkdir(config.STORAGE_PATH, { recursive: true });

    try {
      for await (const part of parts) {
        if (part.type === 'field') {
          fields[part.fieldname] = String(part.value);
          continue;
        }
        if (part.fieldname !== 'file') {
          part.file.resume();
          continue;
        }
        if (!isAcceptedAudio(part.mimetype, part.filename)) {
          part.file.resume();
          return reply.code(415).send({ error: 'Format média non pris en charge.' });
        }
        const key = `${randomUUID()}${extensionFor(part.filename)}`;
        stagedKey = key;
        const destination = path.join(config.STORAGE_PATH, key);
        let received = 0;
        const limiter = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            received += chunk.length;
            callback(received > userMaxAudioBytes
              ? demoLimits ? new DemoUploadError('file-too-large', demoLimits.maxFileBytes) : new Error('Fichier média trop volumineux.')
              : null, chunk);
          },
        });
        await pipeline(part.file, limiter, createWriteStream(destination, { flags: 'wx' }));
        const info = await stat(destination);
        uploaded = { key, originalFilename: part.filename, mimeType: /\.mp4$/i.test(part.filename) ? 'video/mp4' : /\.webm$/i.test(part.filename) ? 'video/webm' : part.mimetype, size: info.size };
      }

      const input = importedMetadataSchema.parse(fields);
      if (!uploaded) return reply.code(400).send({ error: 'Fichier média manquant.' });
      if (!(await ownsProject(user.id, input.projectId))) {
        await unlink(path.join(config.STORAGE_PATH, uploaded.key));
        return reply.code(404).send({ error: 'Projet introuvable.' });
      }
      if (input.categoryId && !(await categoryBelongsToProject(input.categoryId, input.projectId))) {
        await unlink(path.join(config.STORAGE_PATH, uploaded.key));
        return reply.code(400).send({ error: 'Catégorie invalide pour ce projet.' });
      }
      const subcategory = input.subcategoryId ? await subcategoryForProject(input.subcategoryId, input.projectId) : undefined;
      if (input.subcategoryId && (!subcategory || subcategory.categoryId !== (input.categoryId ?? null))) {
        await unlink(path.join(config.STORAGE_PATH, uploaded.key));
        return reply.code(400).send({ error: 'Sous-catégorie invalide pour cette catégorie.' });
      }

      const track = await insertTrackWithinQuota(user.id, {
        projectId: input.projectId,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        title: input.title,
        durationMs: input.durationMs,
        startTimeMs: input.startTimeMs,
        endTimeMs: input.endTimeMs,
        fadeInMs: input.fadeInMs,
        fadeOutMs: input.fadeOutMs,
        loop: fields.loop === 'true',
        color: input.color,
        tags: input.tags,
        description: input.description,
        copyrightText: input.copyrightText,
        sourceUrl: input.sourceUrl,
        sourceId: input.sourceId,
        position: input.position,
        originalFilename: uploaded.originalFilename,
        storageKey: uploaded.key,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.size,
      });
      return reply.code(201).send({ track });
    } catch (error) {
      const key = uploaded?.key ?? stagedKey;
      if (key) await unlink(path.join(config.STORAGE_PATH, key)).catch(() => undefined);
      throw error;
    }
  });

  app.post('/api/tracks/import-remote', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const input = importedMetadataSchema.extend({
      url: z.string().url(),
      loop: z.boolean().default(false),
    }).parse(request.body);
    if (!(await ownsProject(user.id, input.projectId))) return reply.code(404).send({ error: 'Projet introuvable.' });
    if (input.categoryId && !(await categoryBelongsToProject(input.categoryId, input.projectId))) {
      return reply.code(400).send({ error: 'Catégorie invalide pour ce projet.' });
    }
    const subcategory = input.subcategoryId ? await subcategoryForProject(input.subcategoryId, input.projectId) : undefined;
    if (input.subcategoryId && (!subcategory || subcategory.categoryId !== (input.categoryId ?? null))) {
      return reply.code(400).send({ error: 'Sous-catégorie invalide pour cette catégorie.' });
    }
    const remoteUrl = new URL(input.url);
    if (!isAllowedOpenverseAudioUrl(input.url)) {
      return reply.code(400).send({ error: 'Cette source audio Openverse n’est pas autorisée.' });
    }

    const response = await fetch(remoteUrl, { redirect: 'error', signal: AbortSignal.timeout(90_000) });
    if (!response.ok || !response.body) return reply.code(502).send({ error: 'Téléchargement Openverse impossible.' });
    const mimeType = response.headers.get('content-type')?.split(';')[0] ?? 'audio/mpeg';
    if (!isAcceptedAudio(mimeType, remoteUrl.pathname)) return reply.code(415).send({ error: 'Format Openverse non pris en charge.' });
    const demoLimits = user.isDemo ? await demoLimitsForUser(user.id) : null;
    const userMaxAudioBytes = demoLimits?.maxFileBytes ?? maxAudioBytes;
    const announcedSize = Number(response.headers.get('content-length') ?? 0);
    if (announcedSize > userMaxAudioBytes) {
      if (demoLimits) throw new DemoUploadError('file-too-large', demoLimits.maxFileBytes);
      return reply.code(413).send({ error: 'Le fichier dépasse 250 Mo.' });
    }

    await mkdir(config.STORAGE_PATH, { recursive: true });
    const key = `${randomUUID()}${extensionFor(remoteUrl.pathname)}`;
    const destination = path.join(config.STORAGE_PATH, key);
    let downloaded = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        downloaded += chunk.length;
        callback(downloaded > userMaxAudioBytes
          ? demoLimits ? new DemoUploadError('file-too-large', demoLimits.maxFileBytes) : new Error('Fichier distant trop volumineux.')
          : null, chunk);
      },
    });
    try {
      await pipeline(Readable.from(response.body as AsyncIterable<Uint8Array>), limiter, createWriteStream(destination, { flags: 'wx' }));
      const track = await insertTrackWithinQuota(user.id, {
        projectId: input.projectId,
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        title: input.title,
        originalFilename: path.basename(remoteUrl.pathname) || `${input.title}.mp3`,
        storageKey: key,
        mimeType,
        sizeBytes: downloaded,
        durationMs: input.durationMs,
        startTimeMs: input.startTimeMs,
        endTimeMs: input.endTimeMs,
        fadeInMs: input.fadeInMs,
        fadeOutMs: input.fadeOutMs,
        volume: 1,
        loop: input.loop,
        color: input.color,
        tags: input.tags,
        description: input.description,
        copyrightText: input.copyrightText,
        sourceUrl: input.sourceUrl ?? input.url,
        sourceId: input.sourceId,
        position: input.position,
      });
      return reply.code(201).send({ track });
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      throw error;
    }
  });

  app.get('/api/tracks/:id/stream', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const track = await ownedTrack(user.id, id);
    if (!track) return reply.code(404).send({ error: 'Son introuvable.' });
    const filePath = path.join(config.STORAGE_PATH, track.storageKey);
    const info = await stat(filePath);
    const range = request.headers.range;

    reply.header('Accept-Ranges', 'bytes').header('Content-Type', track.mimeType).header('Cache-Control', 'private, max-age=86400');
    if (!range) {
      reply.header('Content-Length', info.size);
      return reply.send(createReadStream(filePath));
    }

    const parsedRange = parseByteRange(range, info.size);
    if (!parsedRange) return reply.code(416).header('Content-Range', `bytes */${info.size}`).send();
    const { start, end } = parsedRange;
    reply.code(206)
      .header('Content-Range', `bytes ${start}-${end}/${info.size}`)
      .header('Content-Length', end - start + 1);
    return reply.send(createReadStream(filePath, { start, end }));
  });

  app.patch('/api/tracks/batch', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const commonUpdatesSchema = z.object({
      categoryId: z.string().uuid().nullable().optional(),
      subcategoryId: z.string().uuid().nullable().optional(),
      volume: z.number().min(0).max(1).optional(),
      loop: z.boolean().optional(),
      fadeInMs: z.number().int().min(0).max(60_000).optional(),
      fadeOutMs: z.number().int().min(0).max(60_000).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    }).strict().refine((updates) => Object.keys(updates).length > 0, { message: 'Aucune modification commune sélectionnée.' });
    const input = z.object({
      projectId: z.string().uuid(),
      trackIds: z.array(z.string().uuid()).min(1).max(500)
        .refine((trackIds) => new Set(trackIds).size === trackIds.length, { message: 'Un morceau ne peut être sélectionné qu’une fois.' }),
      updates: commonUpdatesSchema.optional(),
      tagChange: z.object({ mode: z.enum(['add', 'remove', 'replace']), tags: trackTagsSchema }).optional(),
    }).refine((value) => value.updates || value.tagChange, { message: 'Sélectionnez au moins une modification.' }).parse(request.body);

    if (!(await ownsProject(user.id, input.projectId))) return reply.code(404).send({ error: 'Projet introuvable.' });
    if (input.updates?.categoryId && !(await categoryBelongsToProject(input.updates.categoryId, input.projectId))) {
      return reply.code(400).send({ error: 'Catégorie invalide pour ce projet.' });
    }
    const destinationSubcategory = input.updates?.subcategoryId
      ? await subcategoryForProject(input.updates.subcategoryId, input.projectId)
      : undefined;
    if (input.updates?.subcategoryId && !destinationSubcategory) {
      return reply.code(400).send({ error: 'Sous-catégorie invalide pour ce projet.' });
    }
    if (destinationSubcategory && input.updates?.categoryId !== undefined && destinationSubcategory.categoryId !== input.updates.categoryId) {
      return reply.code(400).send({ error: 'La sous-catégorie ne correspond pas à la catégorie de destination.' });
    }
    const selectedTracks = await db.select().from(tracks)
      .where(and(eq(tracks.projectId, input.projectId), inArray(tracks.id, input.trackIds)));
    if (selectedTracks.length !== input.trackIds.length) {
      return reply.code(400).send({ error: 'La sélection contient un morceau invalide.' });
    }
    const tagChange = input.tagChange;
    const nextTags = tagChange ? new Map(selectedTracks.map((track) => [
      track.id,
      applyTrackTagChange(track.tags, tagChange),
    ])) : undefined;
    if (nextTags && [...nextTags.values()].some((tags) => tags.length > 30)) {
      return reply.code(400).send({ error: 'Un morceau ne peut pas contenir plus de 30 tags.' });
    }

    await db.transaction(async (transaction) => {
      if (input.updates) {
        const locationUpdate = batchTrackLocationUpdate(input.updates, destinationSubcategory);
        await transaction.update(tracks).set({ ...input.updates, ...locationUpdate })
          .where(and(eq(tracks.projectId, input.projectId), inArray(tracks.id, input.trackIds)));
      }
      if (nextTags) {
        for (const [trackId, tags] of nextTags) {
          await transaction.update(tracks).set({ tags }).where(eq(tracks.id, trackId));
        }
      }
    });
    const updatedTracks = await db.select().from(tracks)
      .where(and(eq(tracks.projectId, input.projectId), inArray(tracks.id, input.trackIds)))
      .orderBy(asc(tracks.position), asc(tracks.createdAt));
    return { tracks: updatedTracks };
  });

  app.patch('/api/tracks/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const existingTrack = await ownedTrack(user.id, id);
    if (!existingTrack) return reply.code(404).send({ error: 'Son introuvable.' });
    const input = z.object({
      title: z.string().trim().min(1).max(160).optional(),
      categoryId: z.string().uuid().nullable().optional(),
      volume: z.number().min(0).max(1).optional(),
      loop: z.boolean().optional(),
      fadeInMs: z.number().int().min(0).max(60_000).optional(),
      fadeOutMs: z.number().int().min(0).max(60_000).optional(),
      startTimeMs: z.number().int().min(0).optional(),
      endTimeMs: z.number().int().positive().nullable().optional(),
      videoEndBehavior: z.enum(['black', 'hold']).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      tags: trackTagsSchema.optional(),
    }).parse(request.body);
    if (input.categoryId && !(await categoryBelongsToProject(input.categoryId, existingTrack.projectId))) {
      return reply.code(400).send({ error: 'Catégorie invalide pour ce projet.' });
    }
    const nextStartTimeMs = input.startTimeMs ?? existingTrack.startTimeMs;
    const nextEndTimeMs = input.endTimeMs === undefined ? existingTrack.endTimeMs : input.endTimeMs;
    if (nextEndTimeMs !== null && nextEndTimeMs <= nextStartTimeMs) {
      return reply.code(400).send({ error: 'La fin du son doit être située après son début.' });
    }
    const [track] = await db.update(tracks).set({ ...input, ...(input.categoryId !== undefined && input.categoryId !== existingTrack.categoryId ? { subcategoryId: null } : {}) }).where(eq(tracks.id, id)).returning();
    return { track };
  });

  app.patch('/api/tracks/:id/reorder', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const existingTrack = await ownedTrack(user.id, id);
    if (!existingTrack) return reply.code(404).send({ error: 'Son introuvable.' });
    const input = z.object({
      categoryId: z.string().uuid().nullable(),
      beforeTrackId: z.string().uuid().nullable().optional(),
      subcategoryId: z.string().uuid().nullable().optional(),
    }).parse(request.body);
    if (input.categoryId && !(await categoryBelongsToProject(input.categoryId, existingTrack.projectId))) {
      return reply.code(400).send({ error: 'Catégorie invalide pour ce projet.' });
    }
    if (input.subcategoryId) {
      const [subcategory] = await db.select().from(trackSubcategories).where(and(eq(trackSubcategories.id, input.subcategoryId), eq(trackSubcategories.projectId, existingTrack.projectId))).limit(1);
      if (!subcategory || subcategory.categoryId !== input.categoryId) return reply.code(400).send({ error: 'Sous-catégorie invalide pour cette catégorie.' });
    }

    const projectTracks = await db.select().from(tracks)
      .where(eq(tracks.projectId, existingTrack.projectId))
      .orderBy(asc(tracks.position), asc(tracks.createdAt));
    const target = input.beforeTrackId ? projectTracks.find((track) => track.id === input.beforeTrackId) : undefined;
    if (input.beforeTrackId && !target) return reply.code(400).send({ error: 'Position de destination invalide.' });
    if (target && target.categoryId !== input.categoryId) return reply.code(400).send({ error: 'La destination ne correspond pas à la catégorie.' });

    const positioned = reorderTracks(projectTracks, id, input.categoryId, input.beforeTrackId)
      .map((track) => track.id === id && input.subcategoryId !== undefined ? { ...track, subcategoryId: input.subcategoryId } : track);

    await db.transaction(async (transaction) => {
      for (const track of positioned) {
        await transaction.update(tracks)
          .set({ position: track.position, ...(track.id === id ? { categoryId: input.categoryId, ...(input.subcategoryId !== undefined ? { subcategoryId: input.subcategoryId } : {}) } : {}) })
          .where(eq(tracks.id, track.id));
      }
    });
    return { tracks: positioned };
  });

  app.delete('/api/tracks/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const track = await ownedTrack(user.id, id);
    if (!track) return reply.code(404).send({ error: 'Son introuvable.' });
    await db.delete(tracks).where(eq(tracks.id, id));
    await unlink(path.join(config.STORAGE_PATH, track.storageKey)).catch(() => undefined);
    return reply.code(204).send();
  });
}
