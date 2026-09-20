import { bridgeClient } from './bridge-client';
import { audioCacheName, fetchTrackAudio, trackStreamUrl } from './offline-audio';
import type { Track } from '../types';

export async function loadWaveformAudio(track: Track, signal: AbortSignal): Promise<Response> {
  signal.throwIfAborted();
  if ('caches' in globalThis) {
    const cache = await caches.open(audioCacheName).catch(() => undefined);
    const cached = await cache?.match(trackStreamUrl(track.id), { ignoreVary: true });
    signal.throwIfAborted();
    if (cached) return cached;
  }
  if (bridgeClient.isAssociated()) {
    try {
      const response = await bridgeClient.cachedAudio(track, AbortSignal.any([signal, AbortSignal.timeout(15_000)]));
      const blob = await response.blob();
      signal.throwIfAborted();
      if (blob.size !== track.sizeBytes) throw new Error('Fichier local incomplet.');
      return new Response(blob, { headers: { 'Content-Type': track.mimeType } });
    } catch { signal.throwIfAborted(); }
  }
  try {
    const response = await fetchTrackAudio(track.id);
    signal.throwIfAborted();
    return response;
  } catch (cause) {
    signal.throwIfAborted();
    if (bridgeClient.isAssociated()) throw new Error('Son inaccessible. Pour utiliser le fichier du Bridge hors ligne, ouvrez SonoRiva Bridge 1.0.10 ou ultérieur.');
    throw cause;
  }
}
