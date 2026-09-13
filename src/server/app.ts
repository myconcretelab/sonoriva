import { projectSharingRoutes } from './routes/project-sharing.js';
import { memberRoutes } from './routes/members.js';
import { MembershipError } from './services/memberships.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyRawBody from 'fastify-raw-body';
import { ZodError } from 'zod';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { trackRoutes } from './routes/tracks.js';
import { importRoutes } from './routes/imports.js';
import { freesoundRoutes } from './routes/freesound.js';
import { openverseRoutes } from './routes/openverse.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { releaseRoutes } from './routes/releases.js';
import { publicPlanRoutes } from './routes/public-plans.js';
import { billingRoutes } from './routes/billing.js';
import { bridgeRoutes } from './routes/bridge.js';
import { supportRoutes } from './routes/support.js';
import { CURRENT_VERSION } from './releases.js';
import { AccountStorageError, DemoUploadError, requireWritableAccount } from './services/accounts.js';
import { requireUser } from './services/auth.js';
import { BillingError } from './services/billing.js';

export async function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(cors, {
    origin: config.isProduction ? config.PUBLIC_ORIGINS : true,
    credentials: true,
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(fastifyRawBody, { global: false, encoding: false, runFirst: true });
  await app.register(multipart, {
    limits: { fileSize: 250 * 1024 * 1024, files: 1, fields: 20 },
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Données invalides.', details: error.issues });
    }
    if ((error as { code?: string }).code === '23505') {
      return reply.code(409).send({ error: 'Cette valeur existe déjà.' });
    }
    if (error instanceof AccountStorageError) {
      return reply.code(error.reason === 'quota-exceeded' ? 413 : 403).send({ error: error.message, reason: error.reason });
    }
    if (error instanceof DemoUploadError) {
      return reply.code(413).send({ error: error.message, reason: error.reason });
    }
    if (error instanceof MembershipError) return reply.code(403).send({ error: error.message });
    if (error instanceof BillingError) {
      return reply.code(error.statusCode).send({ error: error.message, reason: error.code });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'Une erreur interne est survenue.' });
  });

  app.addHook('preHandler', async (request, reply) => {
    if (!['POST', 'PUT', 'PATCH'].includes(request.method)) return;
    if (!['/api/projects', '/api/tracks', '/api/imports'].some((prefix) => request.url.startsWith(prefix))) return;
    const user = await requireUser(request, reply);
    if (!user) return;
    await requireWritableAccount(user.id);
  });

  app.get('/api/health', async () => ({ status: 'ok', version: CURRENT_VERSION }));
  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(memberRoutes);
  await app.register(adminRoutes);
  await app.register(releaseRoutes);
  await app.register(publicPlanRoutes);
  await app.register(billingRoutes);
  await app.register(bridgeRoutes);
  await app.register(supportRoutes);
  await app.register(projectRoutes);
  await app.register(projectSharingRoutes);
  await app.register(trackRoutes);
  await app.register(importRoutes);
  await app.register(freesoundRoutes);
  await app.register(openverseRoutes);

  if (config.isProduction) {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const clientRoot = path.resolve(currentDir, '../client');
    await app.register(fastifyStatic, { root: clientRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'Route introuvable.' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
