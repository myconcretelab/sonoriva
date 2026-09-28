import type { MouseAction, PlaylistSoundboardBehavior } from '../types';

export function applyPlaylistSoundboardBehavior(input: {
  action: MouseAction;
  behavior: PlaylistSoundboardBehavior;
  running: boolean;
  ownedIds: Set<string>;
  playbacks: { id: string; paused: boolean; fadingOut?: boolean }[];
  suspend: (behavior: 'pause' | 'stop') => void;
  pause: (id: string) => void;
  stop: (id: string) => void;
}): ReadonlySet<string> | undefined {
  if (input.action === 'none' || input.action === 'stop') return undefined;
  const playbacks = input.playbacks.filter((playback) => input.ownedIds.has(playback.id));
  if (!input.running && playbacks.length === 0) return undefined;
  if (input.behavior === 'continue') return input.ownedIds;
  input.suspend(input.behavior);
  for (const playback of playbacks) {
    if (input.behavior === 'stop' || playback.fadingOut) input.stop(playback.id);
    else if (!playback.paused) input.pause(playback.id);
  }
  if (input.behavior === 'stop') { input.ownedIds.clear(); return undefined; }
  return input.ownedIds;
}
