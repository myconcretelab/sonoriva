import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedTrackIds, cacheTrackOffline, deleteCachedTracks, fetchTrackAudio } from '../src/client/lib/offline-audio.js';

describe('cache audio hors ligne', () => {
  const stored = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (url: string) => stored.get(url)?.clone()),
    put: vi.fn(async (url: string, response: Response) => { stored.set(url, response.clone()); }),
    delete: vi.fn(async (url: string) => stored.delete(url)),
  };

  afterEach(() => {
    stored.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('télécharge une seule fois puis sert le morceau depuis le cache', async () => {
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    await cacheTrackOffline('track-1');
    expect(await cachedTrackIds(['track-1', 'track-2'])).toEqual(new Set(['track-1']));
    expect(new Uint8Array(await (await fetchTrackAudio('track-1')).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetcher).toHaveBeenCalledOnce();

    await deleteCachedTracks(['track-1']);
    expect(await cachedTrackIds(['track-1'])).toEqual(new Set());
  });

  it('utilise le réseau lorsque le morceau n’est pas encore hors ligne', async () => {
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    const fetcher = vi.fn(async () => new Response(new Uint8Array([4]), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    expect(new Uint8Array(await (await fetchTrackAudio('track-2')).arrayBuffer())).toEqual(new Uint8Array([4]));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await cachedTrackIds(['track-2'])).toEqual(new Set(['track-2']));
  });
  it('mutualise lecture et préchargement et signale les octets reçus', async () => {
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const fetcher = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }), { headers: { 'Content-Length': '4' } }));
    vi.stubGlobal('fetch', fetcher);
    const playing = fetchTrackAudio('shared');
    const preloading = cacheTrackOffline('shared');
    await vi.waitFor(() => expect(stream).toBeDefined());
    stream.enqueue(new Uint8Array([1, 2]));
    stream.enqueue(new Uint8Array([3, 4]));
    stream.close();
    const [response] = await Promise.all([playing, preloading]);
    expect((await response.arrayBuffer()).byteLength).toBe(4);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await cachedTrackIds(['shared'])).toEqual(new Set(['shared']));
  });

  it('ne marque pas un fichier incomplet comme disponible', async () => {
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]), { headers: { 'Content-Length': '4' } })));
    await expect(cacheTrackOffline('truncated')).rejects.toThrow('incomplet');
    expect(await cachedTrackIds(['truncated'])).toEqual(new Set());
  });

  it('permet la lecture malgré un quota dépassé sans prétendre avoir conservé le son', async () => {
    vi.stubGlobal('caches', { open: vi.fn(async () => ({ ...cache, put: vi.fn().mockRejectedValue(new Error('quota')) })) });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1]))));
    expect((await fetchTrackAudio('quota')).ok).toBe(true);
    expect(await cachedTrackIds(['quota'])).toEqual(new Set());
    await expect(cacheTrackOffline('quota')).rejects.toThrow('quota');
  });

});
