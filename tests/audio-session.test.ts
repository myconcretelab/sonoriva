// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { audioEngine } from '../src/client/lib/audio-engine';
import type { Track } from '../src/client/types';

vi.mock('../src/client/lib/offline-audio', () => ({
  fetchTrackAudio: vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })),
}));

afterEach(() => { vi.unstubAllGlobals(); });

it('annule un départ en cours de décodage quand la session est révoquée', async () => {
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
  const playback = audioEngine.play({ id: 'pending-session-track', title: 'En attente', mimeType: 'audio/mpeg', fadeInMs: 0 } as Track);
  const rejected = expect(playback).rejects.toThrow('session de lecture');
  await vi.waitFor(() => expect(finishDecode).toBeDefined());
  audioEngine.endUserSession();
  finishDecode!({ duration: 10 } as AudioBuffer);
  await rejected;
  expect(createSource).not.toHaveBeenCalled();
});
