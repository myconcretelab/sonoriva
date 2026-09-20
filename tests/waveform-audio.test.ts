import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ associated: vi.fn(), cachedAudio: vi.fn(), fetchTrackAudio: vi.fn() }));
vi.mock('../src/client/lib/bridge-client', () => ({ bridgeClient: { isAssociated: mocks.associated, cachedAudio: mocks.cachedAudio } }));
vi.mock('../src/client/lib/offline-audio', () => ({ audioCacheName: 'sonoriva-audio-v1', trackStreamUrl: (id: string) => `/api/tracks/${id}/stream`, fetchTrackAudio: mocks.fetchTrackAudio }));
import { loadWaveformAudio } from '../src/client/lib/waveform-audio';
import type { Track } from '../src/client/types';
const track = { id: 'sound', sizeBytes: 4, mimeType: 'audio/wav' } as Track;
let match: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  match = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('caches', { open: vi.fn(async () => ({ match })) });
  mocks.associated.mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
describe('audio local de la forme d’onde', () => {
  it('utilise le cache navigateur sans appeler Bridge ni le serveur', async () => {
    match.mockResolvedValue(new Response('wave'));
    expect(await (await loadWaveformAudio(track, signal())).text()).toBe('wave');
    expect(mocks.cachedAudio).not.toHaveBeenCalled();
    expect(mocks.fetchTrackAudio).not.toHaveBeenCalled();
  });
  it('utilise le fichier Bridge hors ligne sans demander le serveur', async () => {
    mocks.cachedAudio.mockResolvedValue(new Response('wave'));
    mocks.fetchTrackAudio.mockRejectedValue(new TypeError('Offline'));
    const response = await loadWaveformAudio(track, signal());
    expect(await response.text()).toBe('wave');
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
    expect(mocks.fetchTrackAudio).not.toHaveBeenCalled();
  });
  it('retombe sur le serveur pour un ancien Bridge ou un fichier absent', async () => {
    mocks.cachedAudio.mockRejectedValue(new Error('404'));
    mocks.fetchTrackAudio.mockResolvedValue(new Response('wave'));
    expect(await (await loadWaveformAudio(track, signal())).text()).toBe('wave');
    expect(mocks.fetchTrackAudio).toHaveBeenCalledWith(track.id);
  });
  it('refuse un fichier Bridge incomplet', async () => {
    mocks.cachedAudio.mockResolvedValue(new Response('wa'));
    mocks.fetchTrackAudio.mockResolvedValue(new Response('wave'));
    expect(await (await loadWaveformAudio(track, signal())).text()).toBe('wave');
    expect(mocks.fetchTrackAudio).toHaveBeenCalledOnce();
  });
  it('explique la version Bridge requise si aucun fichier n’est accessible', async () => {
    mocks.cachedAudio.mockRejectedValue(new Error('404'));
    mocks.fetchTrackAudio.mockRejectedValue(new TypeError('Offline'));
    await expect(loadWaveformAudio(track, signal())).rejects.toThrow('1.0.10');
  });
  it('ne tente pas le serveur après une annulation du chargement local', async () => {
    const controller = new AbortController();
    mocks.cachedAudio.mockImplementation(async () => { controller.abort(); throw controller.signal.reason; });
    await expect(loadWaveformAudio(track, controller.signal)).rejects.toThrow();
    expect(mocks.fetchTrackAudio).not.toHaveBeenCalled();
  });
});
