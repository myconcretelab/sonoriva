import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDetail } from '../src/client/types';
const mocks = vi.hoisted(() => ({ discover: vi.fn(), native: vi.fn(), preload: vi.fn(), user: vi.fn(), workspace: vi.fn(), media: vi.fn(), profile: vi.fn() }));
vi.mock('../src/client/lib/bridge-client', () => ({ bridgeClient: { discover: mocks.discover, localConsoleRequest: mocks.native, preload: mocks.preload } }));
vi.mock('../src/client/lib/local-workspace', () => ({ localUser: mocks.user }));
vi.mock('../src/client/lib/local-workspace-store', () => ({ readWorkspace: mocks.workspace, readLocalMedia: mocks.media }));
vi.mock('../src/client/lib/desktop', () => ({ desktopProfile: mocks.profile }));
import { prepareBridgeWorkspace } from '../src/client/lib/prepare-bridge-workspace';
const detail = { project: { id: 'project' }, tracks: [{ id: 'audio' }, { id: 'video', mimeType: 'video/mp4' }, { id: 'import', localMedia: true }] } as unknown as ProjectDetail;
beforeEach(() => {
  vi.resetAllMocks(); mocks.discover.mockResolvedValue({ capabilities: ['localConsole'] }); mocks.user.mockReturnValue({ id: 'user' });
  mocks.workspace.mockResolvedValue({ detail, userId: 'user', key: 'user:project', pending: {}, mediaIds: ['import'] });
  mocks.media.mockResolvedValue(new Blob(['WAVE'])); mocks.profile.mockReturnValue({ 'sonoriva-user': '{}' });
});
describe('préparation de la régie locale depuis le navigateur', () => {
  it('refuse de remplacer un brouillon natif et un autre utilisateur', async () => {
    mocks.native.mockResolvedValueOnce({ userId: 'other' });
    await expect(prepareBridgeWorkspace(detail)).rejects.toThrow('autre utilisateur');
    mocks.native.mockResolvedValueOnce({ userId: 'user' }).mockResolvedValueOnce({ pending: { sound: {} }, revision: 7 });
    await expect(prepareBridgeWorkspace(detail)).rejects.toThrow('changements à synchroniser');
    expect(mocks.native.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
  });
  it('transfère les imports avec une révision suivie et prépare aussi les vidéos', async () => {
    mocks.native.mockResolvedValueOnce({ userId: 'user' }).mockResolvedValueOnce(null).mockResolvedValueOnce({ revision: 1 }).mockResolvedValueOnce({ revision: 2 }).mockResolvedValueOnce(undefined);
    await prepareBridgeWorkspace(detail);
    const writes = mocks.native.mock.calls.filter(([, init]) => init?.body instanceof FormData);
    expect(writes).toHaveLength(2);
    expect(JSON.parse(writes[0][1].body.get('change'))).toMatchObject({ expectedRevision: 0, workspace: { mediaIds: [] } });
    expect(JSON.parse(writes[1][1].body.get('change'))).toMatchObject({ expectedRevision: 1, workspace: { mediaIds: ['import'] }, mediaId: 'import' });
    expect(writes[1][1].body.get('file').size).toBe(4);
    expect(mocks.preload.mock.calls.map(([track]) => track.id)).toEqual(['audio', 'video']);
  });
  it('conserve le comportement des anciens Bridges', async () => {
    mocks.discover.mockResolvedValue({ capabilities: ['safePlayback'] });
    await prepareBridgeWorkspace(detail);
    expect(mocks.native).not.toHaveBeenCalled();
  });
});

it('ne publie aucun import ni journal natif avant son fichier et autorise la reprise du même transfert', async () => {
  const pending = { base: null, desired: { id: 'import', title: 'Nouveau' }, uploadFields: [['title', 'Nouveau']] };
  mocks.workspace.mockResolvedValue({ detail, userId: 'user', key: 'user:project', pending: { import: pending }, mediaIds: ['import'] });
  mocks.native.mockResolvedValueOnce({ userId: 'user' }).mockResolvedValueOnce({ revision: 2, pending: { import: { ...pending, error: 'Réseau' } }, mediaIds: ['import'] }).mockResolvedValueOnce({ revision: 3 }).mockResolvedValueOnce({ revision: 4 }).mockResolvedValueOnce(undefined);
  await prepareBridgeWorkspace(detail);
  expect(mocks.native.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true);
  expect(mocks.media).not.toHaveBeenCalled();

  mocks.native.mockReset();
  mocks.native.mockResolvedValueOnce({ userId: 'user' }).mockResolvedValueOnce(null).mockResolvedValueOnce({ revision: 1 }).mockRejectedValueOnce(new Error('Transfert interrompu'));
  await expect(prepareBridgeWorkspace(detail)).rejects.toThrow('interrompu');
  const first = JSON.parse(mocks.native.mock.calls.find(([, init]) => init?.body instanceof FormData)![1].body.get('change'));
  expect(first.workspace.pending).toEqual({});
  expect(first.workspace.detail.tracks.map((track: { id: string }) => track.id)).not.toContain('import');
});

it('conserve les fichiers déjà importés dans le Bridge quand le navigateur ne les possède pas', async () => {
  const source = { ...detail, tracks: [...detail.tracks, { id: 'native-import', title: 'Natif', sizeBytes: 4 }] } as ProjectDetail;
  mocks.workspace.mockResolvedValue({ detail: source, pending: {}, mediaIds: ['import'] });
  mocks.native.mockResolvedValueOnce({ userId: 'user' }).mockResolvedValueOnce({ revision: 5, pending: {}, mediaIds: ['native-import', 'native-only'], detail: { tracks: [{ id: 'native-only', title: 'Natif absent de l’ancienne copie navigateur', sizeBytes: 8 }] } }).mockResolvedValueOnce({ revision: 6 }).mockResolvedValueOnce({ revision: 7 }).mockResolvedValueOnce(undefined);
  await prepareBridgeWorkspace(source);
  const writes = mocks.native.mock.calls.filter(([, init]) => init?.body instanceof FormData);
  const final = JSON.parse(writes[1][1].body.get('change')).workspace;
  expect(final.mediaIds).toEqual(expect.arrayContaining(['native-import', 'native-only', 'import']));
  expect(final.detail.tracks.find((track: { id: string }) => track.id === 'native-only').title).toBe('Natif absent de l’ancienne copie navigateur');
  expect(final.detail.tracks.find((track: { id: string }) => track.id === 'native-import').localMedia).toBe(true);
  expect(mocks.preload.mock.calls.map(([track]) => track.id)).not.toContain('native-import');
});
