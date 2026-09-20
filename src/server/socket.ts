import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { z } from 'zod';
import { config } from './config.js';
import { cookieValue, sessionCookieName, userFromToken, sessionEvents, tokenHash } from './services/auth.js';
import { canAccessProject } from './services/ownership.js';
import { accountForUserProject } from './services/accounts.js';
import { planFeatures } from './services/commercial-plans.js';

const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), trackId: z.string().uuid(), volumeMultiplier: z.number().min(0).max(1).optional(), outputId: z.string().min(1).max(500).optional() }),
  z.object({ type: z.literal('stop'), trackId: z.string().uuid() }),
  z.object({ type: z.literal('stop-all') }),
  z.object({ type: z.literal('stop-all-immediate') }),
  z.object({ type: z.literal('preload'), trackId: z.string().uuid() }),
  z.object({ type: z.literal('stop-last'), immediate: z.boolean() }),
  z.object({
    type: z.literal('run-action'),
    trackId: z.string().uuid(),
    action: z.enum(['start', 'crossfade', 'fade-in', 'replace', 'stop', 'none']),
    volumeMultiplier: z.number().min(0).max(1).optional(),
    outputId: z.string().min(1).max(500).optional(),
  }),
]);

export function registerSocketServer(app: FastifyInstance): Server {
  const io = new Server(app.server, {
    cors: { origin: config.PUBLIC_ORIGINS, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = cookieValue(socket.handshake.headers.cookie, sessionCookieName);
      const user = await userFromToken(token);
      if (!user) return next(new Error('unauthorized'));
      socket.data.userId = user.id;
      socket.data.token = token;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const revoke = () => { socket.emit('session-revoked'); socket.disconnect(true); };
    const onRevoked = (hash: string) => { if (hash === tokenHash(socket.data.token)) revoke(); };
    sessionEvents.on('revoked', onRevoked);
    socket.on('disconnect', () => sessionEvents.off('revoked', onRevoked));
    socket.use(async (_packet, next) => {
      try {
        if (!(await userFromToken(socket.data.token))) { revoke(); return; }
        next();
      } catch { next(new Error('unauthorized')); }
    });
    socket.on('join-project', async (payload, acknowledge) => {
      const parsed = z.object({ projectId: z.string().uuid(), role: z.enum(['player', 'controller']) }).safeParse(payload);
      if (!parsed.success || !(await canAccessProject(socket.data.userId, parsed.data.projectId))) {
        acknowledge?.({ ok: false });
        return;
      }
      if (parsed.data.role === 'controller') {
        const account = await accountForUserProject(socket.data.userId, parsed.data.projectId);
        if (!account || !planFeatures(account.plan).remoteControl) {
          acknowledge?.({ ok: false });
          return;
        }
      }
      await socket.join(`${parsed.data.projectId}:${parsed.data.role}`);
      acknowledge?.({ ok: true });
    });

    socket.on('remote-command', async (payload) => {
      const parsed = z.object({ projectId: z.string().uuid(), command: commandSchema }).safeParse(payload);
      if (!parsed.success || !(await canAccessProject(socket.data.userId, parsed.data.projectId))) return;
      const account = await accountForUserProject(socket.data.userId, parsed.data.projectId);
      if (!account || !planFeatures(account.plan).remoteControl) return;
      io.to(`${parsed.data.projectId}:player`).emit('remote-command', parsed.data.command);
    });
  });

  return io;
}
