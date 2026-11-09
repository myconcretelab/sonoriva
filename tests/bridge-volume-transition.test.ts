import { afterEach, describe, expect, it, vi } from 'vitest';
import { BridgeClient, type BridgePlayback } from '../src/client/lib/bridge-client';
import { playbackVolumeAt } from '../src/client/lib/audio-engine';
import type { Track } from '../src/client/types';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('volume visuel de SonoRiva Bridge', () => {
  it('conserve le fondu vers 16 % pendant l’attente du premier état de lecture', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
    const client = new BridgeClient();
    client.saveAssociation('device', 'token');
    client.setMode('bridge');
    let confirm!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/status')) return Response.json({ capabilities: ['safePlayback'] });
      if (url.endsWith('/play')) {
        expect(JSON.parse(String(init.body))).toMatchObject({ fadeInMs: 2_000, volumeMultiplier: .16 });
        return Response.json({ playbackId: 'incoming' });
      }
      return new Promise<Response>((resolve) => { confirm = resolve; });
    }));
    const launch = client.play({ id: 'track', volume: 1, sizeBytes: 4 } as Track, 2_000, .16);
    await vi.waitFor(() => expect(confirm).toBeDefined());

    // Another status read can arrive before the launch response publishes its playback.
    expect(client.getPlaybacks()).toEqual([]);
    confirm(Response.json({ playbacks: [{ id: 'incoming', trackId: 'track', volume: .16, fadingOut: false, channel: 'main' }] }));
    await launch;

    const playback = client.getPlaybacks()[0];
    expect(playback).toMatchObject({ volume: .16, volumeFrom: 0, volumeTransitionStartedAtMs: 1_000, volumeTransitionDurationMs: 2_000 });
    const transition = { ...playback, volumeFrom: playback.volumeFrom!, volumeTransitionStartedAtMs: playback.volumeTransitionStartedAtMs!, volumeTransitionDurationMs: playback.volumeTransitionDurationMs! };
    expect(playbackVolumeAt(transition, 1_000)).toBe(0);
    expect(playbackVolumeAt(transition, 2_000)).toBeCloseTo(.08);
    expect(playbackVolumeAt(transition, 3_000)).toBeCloseTo(.16);
  });

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
