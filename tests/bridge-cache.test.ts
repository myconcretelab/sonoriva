import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BridgeClient } from '../src/client/lib/bridge-client';
import { getDownloadProgress } from '../src/client/lib/download-state';
import type { Track } from '../src/client/types';
const track = { id: 'sound', title: 'Son', sizeBytes: 4 } as Track;
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
function client() {
  const bridge = new BridgeClient();
  bridge.saveAssociation('device', 'token');
  bridge.setMode('bridge');
  return bridge;
}
it('relit le cache après reconnexion et répercute les suppressions et la progression', async () => {
  const bridge = client();
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ tracks: { sound: 4 }, downloads: { next: [2, 8] } }))
    .mockResolvedValueOnce(Response.json({ tracks: {}, downloads: {} }));
  vi.stubGlobal('fetch', fetcher);
  await bridge.refreshCache();
  expect(bridge.getCachedTrackIds()).toEqual(new Set(['sound']));
  expect(getDownloadProgress('bridge').get('next')).toEqual({ received: 2, total: 8 });
  await bridge.refreshCache();
  expect(bridge.getCachedTrackIds().size).toBe(0);
  expect(getDownloadProgress('bridge').size).toBe(0);
});
it('partage les préchargements concurrents et marque le son seulement après succès', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  const bridge = client();
  const first = bridge.preload(track);
  const second = bridge.preload(track);
  expect(bridge.getCachedTrackIds().size).toBe(0);
  finish(Response.json({ cached: true }));
  await Promise.all([first, second]);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(bridge.getCachedTrackIds().has(track.id)).toBe(true);
});
it('refuse les anciens bridges qui ne garantissent pas l’expiration', async () => {
  const fetcher = vi.fn(async () => Response.json({ capabilities: [] }));
  vi.stubGlobal('fetch', fetcher);
  await expect(client().play(track, 0, 1)).rejects.toThrow('Mettez SonoRiva Bridge à jour');
  expect(fetcher).toHaveBeenCalledOnce();
});
it('envoie une annulation identifiable si le lancement est abandonné', async () => {
  const paths: string[] = [];
  let requestId = '';
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    paths.push(url);
    if (url.endsWith('/status')) return Response.json({ capabilities: ['safePlayback'] });
    if (url.endsWith('/play')) {
      requestId = JSON.parse(String(init.body)).requestId;
      return new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)));
    }
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal('fetch', fetcher);
  const signal = new AbortController();
  const playback = client().play(track, 0, 1, 'main', undefined, signal.signal);
  const rejected = expect(playback).rejects.toThrow('arrêt');
  await vi.waitFor(() => expect(requestId).not.toBe(''));
  signal.abort(new Error('arrêt'));
  await rejected;
  expect(paths.some((path) => path.endsWith(`/cancel-launch/${requestId}`))).toBe(true);
});
