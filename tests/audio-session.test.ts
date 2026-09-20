// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { Track } from '../src/client/types';

vi.mock('../src/client/lib/offline-audio', () => ({
  fetchTrackAudio: vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })),
}));

afterEach(() => { vi.unstubAllGlobals(); });

it.each(['session', 'track', 'all', 'playlist'] as const)('annule un départ en cours de décodage après arrêt %s', async (kind) => {
  vi.resetModules();
  const { audioEngine } = await import('../src/client/lib/audio-engine');
  const controller = new AbortController();
  let finishDecode: ((buffer: AudioBuffer) => void) | undefined;
  const createSource = vi.fn();
  vi.stubGlobal('AudioContext', class {
    state = 'running';
    currentTime = 0;
    destination = {};
    createGain() { return { gain: { setValueAtTime: vi.fn() }, connect: vi.fn() }; }
    createBufferSource = createSource;
    decodeAudioData() { return new Promise<AudioBuffer>((resolve) => { finishDecode = resolve; }); }
  });
  const playback = audioEngine.play({ id: 'pending-session-track', title: 'En attente', mimeType: 'audio/mpeg', fadeInMs: 0 } as Track, 0, 1, undefined, undefined, controller.signal);
  const rejected = expect(playback).rejects.toThrow(kind === 'session' ? 'session de lecture' : 'annulé');
  await vi.waitFor(() => expect(finishDecode).toBeDefined());
  if (kind === 'session') audioEngine.endUserSession();
  else if (kind === 'track') audioEngine.stop('pending-session-track');
  else if (kind === 'playlist') controller.abort(new Error('Lancement annulé'));
  else audioEngine.stopAll([]);
  finishDecode!({ duration: 10 } as AudioBuffer);
  await rejected;
  expect(createSource).not.toHaveBeenCalled();
});
