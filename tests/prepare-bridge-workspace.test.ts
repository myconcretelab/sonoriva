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
