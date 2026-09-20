import { setDownloadProgress } from './download-state';
export const audioCacheName = 'sonoriva-audio-v1';

export function trackStreamUrl(trackId: string): string {
  return `/api/tracks/${trackId}/stream`;
}

export async function cachedTrackIds(trackIds: string[]): Promise<Set<string>> {
  if (!('caches' in globalThis)) return new Set();
  const cache = await caches.open(audioCacheName);
  const matches = await Promise.all(trackIds.map(async (trackId) => [trackId, Boolean(await cache.match(trackStreamUrl(trackId), { ignoreVary: true }))] as const));
  return new Set(matches.flatMap(([trackId, cached]) => cached ? [trackId] : []));
}

const pending = new Map<string, Promise<Response>>();
const listeners = new Set<() => void>();
export function subscribeOfflineCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function cacheTrackOffline(trackId: string): Promise<void> {
  if (!('caches' in globalThis)) throw new Error('Le stockage hors ligne est indisponible dans ce navigateur.');
  await fetchTrackAudio(trackId, true);
}

export async function fetchTrackAudio(trackId: string, requireStorage = false): Promise<Response> {
  const existing = pending.get(trackId);
  if (existing) {
    const response = (await existing).clone();
    if (requireStorage && !(await cachedTrackIds([trackId])).has(trackId)) throw new Error('Stockage hors ligne impossible.');
    return response;
  }
  const loading = downloadTrack(trackId, requireStorage);
  pending.set(trackId, loading);
  try { return (await loading).clone(); }
  finally { pending.delete(trackId); }
}

async function downloadTrack(trackId: string, requireStorage: boolean): Promise<Response> {
  const url = trackStreamUrl(trackId);
  const cache = 'caches' in globalThis ? await caches.open(audioCacheName).catch(() => undefined) : undefined;
  const cached = await cache?.match(url, { ignoreVary: true });
  if (cached) return cached;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const resetTimeout = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), 15_000);
  };
  resetTimeout();
  setDownloadProgress('browser', trackId, { received: 0, total: 0 });
  try {
    const response = await fetch(url, { credentials: 'include', signal: controller.signal });
    if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}).`);
    const total = Number(response.headers.get('Content-Length')) || 0;
    const reader = response.body?.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value as Uint8Array<ArrayBuffer>);
        received += value.byteLength;
        resetTimeout();
        setDownloadProgress('browser', trackId, { received, total });
      }
    } else chunks.push(new Uint8Array(await response.arrayBuffer()));
    if (total && !response.headers.has('Content-Encoding') && reader && received !== total) throw new Error('Le fichier audio reçu est incomplet.');
    const headers = new Headers(response.headers);
    headers.delete('Content-Encoding');
    headers.set('Content-Length', String(chunks.reduce((size, chunk) => size + chunk.byteLength, 0)));
    const complete = new Response(new Blob(chunks), { status: 200, headers });
    try {
      if (!cache) throw new Error('Stockage hors ligne indisponible.');
      await cache.put(url, complete.clone());
      listeners.forEach((listener) => listener());
    } catch (cause) { if (requireStorage) throw cause; }
    return complete;
  } finally {
    clearTimeout(timer!);
    setDownloadProgress('browser', trackId);
  }
}

export async function deleteOfflineAudio(): Promise<boolean> {
  const deleted = 'caches' in globalThis ? await caches.delete(audioCacheName) : false;
  listeners.forEach((listener) => listener());
  return deleted;
}

export async function deleteCachedTracks(trackIds: string[]): Promise<void> {
  if (!('caches' in globalThis) || trackIds.length === 0) return;
  const cache = await caches.open(audioCacheName);
  await Promise.all(trackIds.map((trackId) => cache.delete(trackStreamUrl(trackId), { ignoreVary: true })));
  listeners.forEach((listener) => listener());
}
