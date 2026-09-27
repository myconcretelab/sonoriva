import { beforeEach, expect, it, vi } from 'vitest';
import type { Track } from '../src/client/types';
const mocks = vi.hoisted(() => ({ mode: vi.fn(), preload: vi.fn(), browser: vi.fn() }));
vi.mock('../src/client/lib/bridge-client', () => ({ bridgeClient: { getMode: mocks.mode, preload: mocks.preload } }));
vi.mock('../src/client/lib/offline-audio', () => ({ cacheTrackOffline: mocks.browser }));
vi.mock('../src/client/lib/video-engine', () => ({ isVideoTrack: (track: Track) => track.mimeType.startsWith('video/') }));
import { prepareOfflineTracks } from '../src/client/lib/prepare-offline';
const tracks = [{ id: 'cached', mimeType: 'audio/wav' }, { id: 'sound', mimeType: 'audio/wav' }, { id: 'video', mimeType: 'video/mp4' }] as Track[];
beforeEach(() => { vi.resetAllMocks(); mocks.mode.mockReturnValue('bridge'); });
it('télécharge seulement les absents dans le stockage adapté et compte les fichiers existants', async () => {
  const progress = vi.fn();
  await prepareOfflineTracks(tracks, new Set(['cached']), progress);
  expect(mocks.preload).toHaveBeenCalledExactlyOnceWith(tracks[1]);
  expect(mocks.browser).toHaveBeenCalledExactlyOnceWith('video');
  expect(progress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]]);
});
it('utilise le navigateur quand le Bridge est désactivé', async () => {
  mocks.mode.mockReturnValue('browser');
  await prepareOfflineTracks(tracks, new Set(['cached']), vi.fn());
  expect(mocks.preload).not.toHaveBeenCalled();
  expect(mocks.browser.mock.calls).toEqual([['sound'], ['video']]);
});
it('interrompt la préparation si le moteur change pendant un téléchargement', async () => {
  mocks.preload.mockImplementation(async () => { mocks.mode.mockReturnValue('browser'); });
  const progress = vi.fn();
  await expect(prepareOfflineTracks(tracks, new Set(['cached']), progress)).rejects.toThrow('moteur audio a changé');
  expect(progress.mock.calls).toEqual([[1, 3]]);
  expect(mocks.browser).not.toHaveBeenCalled();
});
it('conserve la progression acquise et remonte un échec sans annoncer de succès', async () => {
  mocks.browser.mockRejectedValue(new Error('Stockage plein'));
  const progress = vi.fn();
  await expect(prepareOfflineTracks(tracks, new Set(['cached']), progress)).rejects.toThrow('Stockage plein');
  expect(progress.mock.calls).toEqual([[1, 3], [2, 3]]);
});
