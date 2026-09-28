import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { audioEngine, playbackPositionAt, playbackVolumeAt, type ActivePlayback } from '../src/client/lib/audio-engine.js';
import type { Track } from '../src/client/types.js';

class FakeAudioParam {
  value = 1;
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  cancelScheduledValues() { /* Valeur conservée. */ }
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect() { return this; }
  disconnect() { /* Connexion simulée. */ }
}

class FakeSourceNode {
  buffer?: { duration: number };
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  connect() { return this; }
  start() { /* Lecture simulée. */ }
  stop(when = 0) { if (when <= 0) this.onended?.(); }
}

class FakeAudioContext {
  static lastSinkId = '';
  state = 'running';
  currentTime = 0;
  destination = {};
  createBufferSource() { return new FakeSourceNode(); }
  createGain() { return new FakeGainNode(); }
  async decodeAudioData() { return { duration: 60 }; }
  async resume() { this.state = 'running'; }
  async setSinkId(sinkId: string) { FakeAudioContext.lastSinkId = sinkId; }
}

const track: Track = {
  id: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  categoryId: null,
  title: 'Test player controls',
  originalFilename: 'test.wav',
  mimeType: 'audio/wav',
  sizeBytes: 1,
  durationMs: 60_000,
  startTimeMs: 0,
  endTimeMs: null,
  volume: 1,
  loop: false,
  fadeInMs: 0,
  fadeOutMs: 0,
  color: null,
  tags: [],
  description: null,
  copyrightText: null,
  sourceUrl: null,
  sourceId: null,
  position: 0,
  createdAt: new Date().toISOString(),
};

describe('audio player instance controls', () => {
  let latest: ActivePlayback[] = [];
  let latestHistory = new Map<string, number>();
  let unsubscribe: (() => void) | undefined;
  let unsubscribeHistory: (() => void) | undefined;

  beforeAll(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi.fn(async () => [
          { kind: 'audiooutput', deviceId: 'default', label: 'Sortie système par défaut' },
          { kind: 'audiooutput', deviceId: 'mac-speakers', label: 'MacBook Pro Speakers (Built-in)' },
          { kind: 'audiooutput', deviceId: 'headphones', label: 'Écouteurs externes' },
        ]),
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })));
    audioEngine.resetHistory([track.id]);
    unsubscribe = audioEngine.subscribe((playbacks) => { latest = playbacks; });
    unsubscribeHistory = audioEngine.subscribeHistory((history) => { latestHistory = history; });
  });

  afterAll(() => {
    unsubscribe?.();
    unsubscribeHistory?.();
    vi.unstubAllGlobals();
  });

  it('règle le volume, la pause et la boucle indépendamment par lecture', async () => {
    const createdPlaybackId = await audioEngine.play(track, 1_000, .6);
    const playbackId = latest[0]?.id;
    expect(playbackId).toBeTruthy();
    expect(createdPlaybackId).toBe(playbackId);
    expect(latest[0]).toMatchObject({ volume: .6, volumeFrom: 0, volumeTransitionDurationMs: 1_000, paused: false, loop: false, fadingOut: false });
    expect(playbackVolumeAt(latest[0]!, latest[0]!.volumeTransitionStartedAtMs + 500)).toBeCloseTo(.3);

    audioEngine.setInstanceVolume(playbackId!, 1.25);
    expect(latest[0]?.volume).toBe(1);

    audioEngine.togglePauseInstance(playbackId!);
    expect(latest[0]?.paused).toBe(true);

    audioEngine.seekInstance(playbackId!, .5);
    expect(latest[0]?.elapsedMs).toBe(30_000);

    audioEngine.setInstanceLoop(playbackId!, true);
    expect(latest[0]?.loop).toBe(true);

    audioEngine.togglePauseInstance(playbackId!);
    expect(latest[0]?.paused).toBe(false);

    audioEngine.seekInstance(playbackId!, .25);
    expect(latest[0]?.elapsedMs).toBe(15_000);

    audioEngine.persistActiveProgress();
    expect(latestHistory.get(track.id)).toBeCloseTo(.25, 1);

    audioEngine.stopInstance(playbackId!, 500);
    expect(latest[0]).toMatchObject({ fadingOut: true, volume: 0, volumeTransitionDurationMs: 500 });

    audioEngine.stopInstance(playbackId!, 0);
    expect(latest).toHaveLength(0);
  });

  it('conserve un volume maître distinct du volume individuel', async () => {
    audioEngine.setMasterVolume(.42);
    expect(audioEngine.getMasterVolume()).toBe(.42);
    await audioEngine.play(track, 0, .6);
    expect(latest[0]?.volume).toBe(.6);
    audioEngine.stopAll([track], 0);
    audioEngine.setMasterVolume(1.5);
    expect(audioEngine.getMasterVolume()).toBe(1);
  });

  it('refuse une nouvelle lecture lorsque la limite simultanée est atteinte', async () => {
    audioEngine.setMaxActivePlaybacks(1);
    expect(audioEngine.getMaxActivePlaybacks()).toBe(1);
    const limitedTrack = { ...track, id: '33333333-3333-4333-8333-333333333333' };
    const firstPlayback = audioEngine.play(limitedTrack, 0);

    await expect(audioEngine.play(limitedTrack, 0)).rejects.toThrow('Limite de 1 lecture simultanée atteinte.');

    const playbackId = await firstPlayback;
    audioEngine.stopInstance(playbackId, 0);
    audioEngine.setMaxActivePlaybacks(8);
  });

  it('retire le dernier lecteur immédiatement ou avec son fondu', async () => {
    const firstId = await audioEngine.play(track, 0);
    const secondId = await audioEngine.play(track, 0);
    audioEngine.stopLast([track], true);
    expect(latest.map((playback) => playback.id)).toEqual([firstId]);

    audioEngine.stopLast([{ ...track, fadeOutMs: 400 }], false);
    expect(latest[0]).toMatchObject({ id: firstId, fadingOut: true, volumeTransitionDurationMs: 400 });
    audioEngine.stopInstance(firstId, 0);
    expect(secondId).not.toBe(firstId);
  });

  it('réinitialise le spectacle sans recréer une progression lors de l’arrêt', async () => {
    await audioEngine.play(track, 0);
    const playbackId = latest[0]?.id;
    audioEngine.seekInstance(playbackId!, .6);
    audioEngine.persistActiveProgress();
    expect(latestHistory.get(track.id)).toBeCloseTo(.6, 1);

    audioEngine.resetProjectSession([track]);

    expect(latest).toHaveLength(0);
    expect(latestHistory.has(track.id)).toBe(false);
  });

  it('applique et mémorise la sortie audio choisie', async () => {
    await audioEngine.setAudioOutput('studio-output', 'Interface studio');

    expect(FakeAudioContext.lastSinkId).toBe('studio-output');
    expect(audioEngine.getAudioOutputSelection()).toEqual({ deviceId: 'studio-output', label: 'Interface studio' });
    expect(JSON.parse(localStorage.getItem('sonoriva-audio-output-v1') ?? '{}')).toEqual({ deviceId: 'studio-output', label: 'Interface studio' });

    const setSinkId = vi.fn(async () => undefined);
    await audioEngine.applyAudioOutput({ setSinkId } as unknown as HTMLMediaElement);
    expect(setSinkId).toHaveBeenCalledWith('studio-output');

    setSinkId.mockClear();
    await audioEngine.applyAudioOutput({ setSinkId } as unknown as HTMLMediaElement, 'Ecouteurs externes');
    expect(setSinkId).toHaveBeenCalledWith('headphones');

    setSinkId.mockClear();
    await audioEngine.applyAudioOutput({ setSinkId } as unknown as HTMLMediaElement, 'Haut-parleurs MacBook Pro');
    expect(setSinkId).toHaveBeenCalledWith('mac-speakers');

    setSinkId.mockClear();
    await audioEngine.applyAudioOutput({ setSinkId } as unknown as HTMLMediaElement, 'Haut-parleurs MacBook Pro', true);
    expect(setSinkId).toHaveBeenCalledWith('');

    const unavailableSink = vi.fn()
      .mockRejectedValueOnce(new Error('sortie déconnectée'))
      .mockResolvedValueOnce(undefined);
    await audioEngine.applyAudioOutput({ setSinkId: unavailableSink } as unknown as HTMLMediaElement);
    expect(unavailableSink).toHaveBeenNthCalledWith(1, 'studio-output');
    expect(unavailableSink).toHaveBeenNthCalledWith(2, '');

    await audioEngine.setAudioOutput('');
    expect(FakeAudioContext.lastSinkId).toBe('');
    expect(localStorage.getItem('sonoriva-audio-output-v1')).toBeNull();
  });

  it.each(['replace', 'crossfade'] as const)('préserve une lecture de playlist en cours ou en pause lors de %s', async (action) => {
    audioEngine.stopAll([track], 0);
    const playlistId = await audioEngine.play(track, 0);
    const otherId = await audioEngine.play(track, 0);
    const protectedIds = new Set([playlistId]);
    await audioEngine.runAction(action, track, [track], 1, undefined, protectedIds);
    expect(latest.some(item => item.id === playlistId && !item.paused)).toBe(true);
    expect(latest.some(item => item.id === otherId)).toBe(false);
    audioEngine.togglePauseInstance(playlistId);
    await audioEngine.runAction(action, track, [track], 1, undefined, protectedIds);
    expect(latest.some(item => item.id === playlistId && item.paused)).toBe(true);
    audioEngine.togglePauseInstance(playlistId);
    expect(latest.some(item => item.id === playlistId && !item.paused)).toBe(true);
    audioEngine.stopAll([track], 0);
  });

  it('notifie les contrôles de régie lorsque la sortie change', async () => {
    let notifications = 0;
    const unsubscribeRouting = audioEngine.subscribeRouting(() => { notifications += 1; });
    const initialNotifications = notifications;

    await audioEngine.setAudioOutput('console-output', 'Console USB');

    expect(notifications).toBeGreaterThan(initialNotifications);
    unsubscribeRouting();
    await audioEngine.setAudioOutput('');
  });
});

describe('playbackPositionAt', () => {
  const playback = {
    durationMs: 60_000,
    elapsedMs: 10_000,
    loop: false,
    paused: false,
    resumedAtMs: 1_000,
  };

  it('calcule la position courante depuis la reprise', () => {
    expect(playbackPositionAt(playback, 1_500)).toBe(10_500);
  });

  it('fige la position en pause et la limite à la durée', () => {
    expect(playbackPositionAt({ ...playback, paused: true }, 50_000)).toBe(10_000);
    expect(playbackPositionAt(playback, 100_000)).toBe(60_000);
  });

  it('repart du début à chaque boucle', () => {
    expect(playbackPositionAt({ ...playback, loop: true }, 56_000)).toBe(5_000);
  });
});
