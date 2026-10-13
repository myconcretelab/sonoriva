import { afterEach, describe, expect, it, vi } from 'vitest';
import { BridgeClient, type BridgePlayback } from '../src/client/lib/bridge-client';

afterEach(() => vi.restoreAllMocks());

describe('volume visuel de SonoRiva Bridge', () => {
  it('publie immédiatement la transition d’un fondu sortant', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const client = new BridgeClient();
    const playback = {
      id: 'bridge-fade',
      trackId: 'track',
      sequence: 1,
      positionMs: 0,
      durationMs: 10_000,
      loopPlayback: false,
      paused: false,
      volume: .8,
      fadingOut: false,
      channel: 'main',
    } satisfies BridgePlayback;
    (client as unknown as { playbacks: BridgePlayback[] }).playbacks = [playback];
    let latest: BridgePlayback[] = [];
    const unsubscribe = client.subscribe((playbacks) => { latest = playbacks; });

    client.stop(playback.id, 4_000);

    expect(latest[0]).toMatchObject({
      volume: 0,
      volumeFrom: .8,
      volumeTransitionStartedAtMs: 1_000,
      volumeTransitionDurationMs: 4_000,
      fadingOut: true,
    });
    unsubscribe();
  });
});
