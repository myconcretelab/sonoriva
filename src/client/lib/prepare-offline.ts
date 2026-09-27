import { bridgeClient } from './bridge-client';
import { cacheTrackOffline } from './offline-audio';
import { isVideoTrack } from './video-engine';
import type { Track } from '../types';

export interface OfflinePreparation {
  done: number;
  total: number;
  running: boolean;
  error?: string;
}

export async function prepareOfflineTracks(tracks: Track[], cachedIds: Set<string>, onProgress: (done: number, total: number) => void): Promise<void> {
  const mode = bridgeClient.getMode();
  const remaining = tracks.filter((track) => !cachedIds.has(track.id));
  let done = tracks.length - remaining.length;
  onProgress(done, tracks.length);
  for (const track of remaining) {
    if (bridgeClient.getMode() !== mode) throw new Error('Le moteur audio a changé. Relancez le téléchargement pour le stockage actuel.');
    if (mode === 'bridge' && !isVideoTrack(track)) await bridgeClient.preload(track);
    else await cacheTrackOffline(track.id);
    if (bridgeClient.getMode() !== mode) throw new Error('Le moteur audio a changé. Relancez le téléchargement pour le stockage actuel.');
    onProgress(++done, tracks.length);
  }
}
