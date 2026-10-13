import type { Track } from '../types';

export function trackAliasCounts(tracks: Track[]): Map<string, number> {
  const countsByFile = new Map<string, number>();
  for (const track of tracks) {
    const fileKey = track.storageKey ?? `track:${track.id}`;
    countsByFile.set(fileKey, (countsByFile.get(fileKey) ?? 0) + 1);
  }
  return new Map(tracks.map((track) => [track.id, countsByFile.get(track.storageKey ?? `track:${track.id}`) ?? 1]));
}
