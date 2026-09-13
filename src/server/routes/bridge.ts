import { projectAccessCondition } from '../services/ownership.js';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, gt, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/index.js';
import {
  accountMemberships,
  accounts,
  bridgeDevices,
  bridgePairingTickets,
  categories,
  playlistItems,
  playlists,
  plans,
  projects,
  tracks,
  trackSubcategories,
} from '../db/schema.js';
import { accountForUser } from '../services/accounts.js';
import { requireUser } from '../services/auth.js';
import {
  bridgePairingExpiration,
  createBridgeToken,
  hashBridgeToken,
  requireBridgeDevice,
} from '../services/bridge-auth.js';
import { parseByteRange } from '../services/range.js';
import { accountCanUseBridge } from '../services/commercial-plans.js';
import { consumeBridgePairingStatus } from '../services/bridge-pairing.js';

const ticketSchema = z.object({ ticket: z.string().min(32).max(200) });
const deviceIdSchema = z.object({ id: z.string().uuid() });
const pairingAlreadyClaimed = Symbol('pairing-already-claimed');
const bridgeDownloadUrl = 'https://github.com/myconcretelab/sonoriva/releases/tag/bridge-v1.0.1';

function accountHasBridgeAccess(context: Awaited<ReturnType<typeof accountForUser>>): boolean {
  return Boolean(context && accountCanUseBridge({
    ...context.plan,
    accessStatus: context.account.accessStatus,
    isDemo: context.account.isDemo,
  }));
}

export async function bridgeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/bridge/pairings', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    if (user.isDemo) return reply.code(403).send({ error: 'Le bridge n’est pas disponible dans la démonstration temporaire.' });
    const account = await accountForUser(user.id);
    if (!account) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    if (!accountHasBridgeAccess(account)) {
      return reply.code(403).send({ error: 'SonoRiva Bridge est réservé aux forfaits payants actifs.' });
    }

    await db.delete(bridgePairingTickets).where(lt(bridgePairingTickets.expiresAt, new Date()));
    const ticket = createBridgeToken();
    const expiresAt = bridgePairingExpiration();
    await db.insert(bridgePairingTickets).values({
      tokenHash: hashBridgeToken(ticket),
      accountId: account.account.id,
      userId: user.id,
      expiresAt,
    });
    return reply.code(201).send({ ticket, expiresAt: expiresAt.toISOString() });
  });

  app.post('/api/bridge/pairings/status', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const account = await accountForUser(user.id);
    if (!account) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    if (!accountHasBridgeAccess(account)) {
      return reply.code(403).send({ error: 'SonoRiva Bridge est réservé aux forfaits payants actifs.' });
    }
    const { ticket } = ticketSchema.parse(request.body);
    const tokenHash = hashBridgeToken(ticket);
    const status = await db.transaction((transaction) => consumeBridgePairingStatus({
      load: async () => {
        const [pairing] = await transaction.select({
          expiresAt: bridgePairingTickets.expiresAt,
          claimedAt: bridgePairingTickets.claimedAt,
          consumedAt: bridgePairingTickets.consumedAt,
          claimedDeviceId: bridgePairingTickets.claimedDeviceId,
        }).from(bridgePairingTickets).innerJoin(
          accountMemberships,
          eq(accountMemberships.accountId, bridgePairingTickets.accountId),
        ).where(and(
          eq(bridgePairingTickets.tokenHash, tokenHash),
          eq(accountMemberships.userId, user.id),
        )).limit(1);
        return pairing;
      },
      consume: async () => {
        const [consumed] = await transaction.update(bridgePairingTickets)
          .set({ consumedAt: new Date() })
          .where(and(
            eq(bridgePairingTickets.tokenHash, tokenHash),
            isNull(bridgePairingTickets.consumedAt),
          ))
          .returning({ localToken: bridgePairingTickets.localToken, deviceId: bridgePairingTickets.claimedDeviceId });
        return consumed;
      },
      clearLocalToken: async () => {
        await transaction.update(bridgePairingTickets)
          .set({ localToken: null })
          .where(eq(bridgePairingTickets.tokenHash, tokenHash));
      },
    }));

    if (status.status === 'expired') return reply.code(410).send({ error: 'Ce lien d’association a expiré.' });
    return status;
  });

  app.post('/api/bridge/pairings/claim', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = ticketSchema.extend({
      name: z.string().trim().min(1).max(120),
      platform: z.enum(['macos', 'windows', 'linux']),
    }).parse(request.body);
    const now = new Date();
    const localToken = createBridgeToken();
    const deviceToken = createBridgeToken();
    const result = await db.transaction(async (transaction) => {
      const [context] = await transaction.select({
        pairing: bridgePairingTickets,
        accessStatus: accounts.accessStatus,
        isDemo: accounts.isDemo,
        monthlyPriceCents: plans.monthlyPriceCents,
        annualPriceCents: plans.annualPriceCents,
      }).from(bridgePairingTickets)
        .innerJoin(accounts, eq(bridgePairingTickets.accountId, accounts.id))
        .innerJoin(plans, eq(accounts.planCode, plans.code))
        .where(and(
          eq(bridgePairingTickets.tokenHash, hashBridgeToken(input.ticket)),
          gt(bridgePairingTickets.expiresAt, now),
          isNull(bridgePairingTickets.claimedAt),
        )).limit(1);
      if (!context || !accountCanUseBridge(context)) return null;
      const pairing = context.pairing;
      const [device] = await transaction.insert(bridgeDevices).values({
        accountId: pairing.accountId,
        userId: pairing.userId,
        name: input.name,
        platform: input.platform,
        tokenHash: hashBridgeToken(deviceToken),
        lastSeenAt: now,
      }).returning();
      const claimed = await transaction.update(bridgePairingTickets).set({
        claimedAt: now,
        claimedDeviceId: device.id,
        localToken,
      }).where(and(
        eq(bridgePairingTickets.tokenHash, pairing.tokenHash),
        isNull(bridgePairingTickets.claimedAt),
      )).returning({ tokenHash: bridgePairingTickets.tokenHash });
      if (claimed.length !== 1) throw pairingAlreadyClaimed;
      return device;
    }).catch((error) => {
      if (error === pairingAlreadyClaimed) return null;
      throw error;
    });
    if (!result) return reply.code(410).send({ error: 'Ce lien d’association est invalide, expiré ou déjà utilisé.' });
    return {
      deviceId: result.id,
      deviceToken,
      localToken,
      serverUrl: config.PUBLIC_URL,
    };
  });

  app.get('/api/bridge/download', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const account = await accountForUser(user.id);
    if (!account) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    if (!accountHasBridgeAccess(account)) {
      return reply.code(403).send({ error: 'Le téléchargement de SonoRiva Bridge est réservé aux forfaits payants actifs.' });
    }
    return reply.redirect(bridgeDownloadUrl);
  });

  app.get('/api/bridge/devices', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const account = await accountForUser(user.id);
    if (!account) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    const devices = await db.select({
      id: bridgeDevices.id,
      name: bridgeDevices.name,
      platform: bridgeDevices.platform,
      lastSeenAt: bridgeDevices.lastSeenAt,
      createdAt: bridgeDevices.createdAt,
    }).from(bridgeDevices).where(and(
      eq(bridgeDevices.accountId, account.account.id),
      eq(bridgeDevices.userId, user.id),
      isNull(bridgeDevices.revokedAt),
    )).orderBy(asc(bridgeDevices.createdAt));
    return { devices };
  });

  app.delete('/api/bridge/devices/:id', async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const account = await accountForUser(user.id);
    if (!account) return reply.code(404).send({ error: 'Espace de travail introuvable.' });
    const { id } = deviceIdSchema.parse(request.params);
    const revoked = await db.update(bridgeDevices).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(
      eq(bridgeDevices.id, id),
      eq(bridgeDevices.accountId, account.account.id),
      eq(bridgeDevices.userId, user.id),
      isNull(bridgeDevices.revokedAt),
    )).returning({ id: bridgeDevices.id });
    if (!revoked.length) return reply.code(404).send({ error: 'Bridge introuvable.' });
    return reply.code(204).send();
  });

  app.get('/api/bridge/projects', async (request, reply) => {
    const device = await requireBridgeDevice(request, reply);
    if (!device) return;
    return {
      projects: await db.select().from(projects)
        .where(and(eq(projects.accountId, device.accountId), projectAccessCondition(device.userId)))
        .orderBy(asc(projects.position), asc(projects.createdAt)),
    };
  });

  app.get('/api/bridge/projects/:id', async (request, reply) => {
    const device = await requireBridgeDevice(request, reply);
    if (!device) return;
    const { id } = deviceIdSchema.parse(request.params);
    const [project] = await db.select().from(projects).where(and(
      eq(projects.id, id),
      and(eq(projects.accountId, device.accountId), projectAccessCondition(device.userId)),
    )).limit(1);
    if (!project) return reply.code(404).send({ error: 'Projet introuvable.' });
    const [projectCategories, projectSubcategories, projectTracks, savedPlaylists, savedItems] = await Promise.all([
      db.select().from(categories).where(eq(categories.projectId, id)).orderBy(asc(categories.position)),
      db.select().from(trackSubcategories).where(eq(trackSubcategories.projectId, id)).orderBy(asc(trackSubcategories.position), asc(trackSubcategories.createdAt)),
      db.select().from(tracks).where(eq(tracks.projectId, id)).orderBy(asc(tracks.position), asc(tracks.createdAt)),
      db.select().from(playlists).where(eq(playlists.projectId, id)).orderBy(asc(playlists.position), asc(playlists.createdAt)),
      db.select({ playlistId: playlistItems.playlistId, trackId: playlistItems.trackId, rowIndex: playlistItems.rowIndex }).from(playlistItems)
        .innerJoin(playlists, eq(playlistItems.playlistId, playlists.id))
        .where(eq(playlists.projectId, id)).orderBy(asc(playlistItems.position)),
    ]);
    return {
      project,
      categories: projectCategories,
      subcategories: projectSubcategories,
      tracks: projectTracks.map((track) => ({ ...track, audioPath: `/api/bridge/tracks/${track.id}/audio` })),
      playlists: savedPlaylists.map((playlist) => {
        const items = savedItems.filter((item) => item.playlistId === playlist.id).map(({ trackId, rowIndex }) => ({ trackId, rowIndex }));
        return { ...playlist, trackIds: items.map((item) => item.trackId), items };
      }),
    };
  });

  app.get('/api/bridge/tracks/:id/audio', async (request, reply) => {
    const device = await requireBridgeDevice(request, reply);
    if (!device) return;
    const { id } = deviceIdSchema.parse(request.params);
    const [track] = await db.select({ track: tracks }).from(tracks)
      .innerJoin(projects, eq(tracks.projectId, projects.id))
      .where(and(eq(tracks.id, id), and(eq(projects.accountId, device.accountId), projectAccessCondition(device.userId)))).limit(1);
    if (!track?.track) return reply.code(404).send({ error: 'Son introuvable.' });
    const filePath = path.join(config.STORAGE_PATH, track.track.storageKey);
    const info = await stat(filePath);
    const range = request.headers.range;
    reply.header('Accept-Ranges', 'bytes').header('Content-Type', track.track.mimeType)
      .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(track.track.originalFilename)}`)
      .header('Cache-Control', 'private, no-store');
    if (!range) {
      reply.header('Content-Length', info.size);
      return reply.send(createReadStream(filePath));
    }
    const parsedRange = parseByteRange(range, info.size);
    if (!parsedRange) return reply.code(416).header('Content-Range', `bytes */${info.size}`).send();
    reply.code(206)
      .header('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${info.size}`)
      .header('Content-Length', parsedRange.end - parsedRange.start + 1);
    return reply.send(createReadStream(filePath, { start: parsedRange.start, end: parsedRange.end }));
  });
}
