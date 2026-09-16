import { afterEach, expect, it, vi } from 'vitest';
import { audioEngine, type ActivePlayback } from '../src/client/lib/audio-engine';
import { bridgeClient, type BridgePlayback } from '../src/client/lib/bridge-client';

afterEach(() => vi.restoreAllMocks());

it('conserve l’ordre des lectures Bridge après une boucle, une pause et un déplacement', () => {
  let refresh = () => {};
  const base = { durationMs: 1000, loopPlayback: true, paused: false, volume: 1, fadingOut: false, channel: 'main' as const };
  let snapshots: BridgePlayback[] = [
    { ...base, id: 'older', trackId: 'a', sequence: 1, positionMs: 900 },
    { ...base, id: 'newer', trackId: 'b', sequence: 2, positionMs: 300 },
  ];
  vi.spyOn(bridgeClient, 'isEnabled').mockReturnValue(true);
  vi.spyOn(bridgeClient, 'getPlaybacks').mockImplementation(() => snapshots);
  vi.spyOn(bridgeClient, 'subscribe').mockImplementation((listener) => { refresh = listener; return () => {}; });
  let latest: ActivePlayback[] = [];
  const unsubscribe = audioEngine.subscribe((playbacks) => { latest = playbacks; });
  try {
    const startedAt = latest.map(p => p.startedAtMs);
    for (let iteration = 0; iteration < 5; iteration++) {
      snapshots = snapshots.map((p, index) => ({ ...p, positionMs: index === 0 ? 10 : 800, paused: index === 1 }));
      refresh();
      expect(latest.map(p => p.id)).toEqual(['older', 'newer']);
      expect(latest.map(p => p.startedAtMs)).toEqual(startedAt);
    }
    const stop = vi.spyOn(bridgeClient, 'stop').mockImplementation(() => {});
    audioEngine.stopLast([], true);
    expect(stop).toHaveBeenCalledWith('newer', 0);
    snapshots = [];
    refresh();
    expect(latest).toEqual([]);
  } finally { unsubscribe(); }
});
