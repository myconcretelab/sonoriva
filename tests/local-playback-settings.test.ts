import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/client/lib/api';
import { changeRawWorkspace, mergeWorkspace, readWorkspace } from '../src/client/lib/local-workspace-store';
import { localProject, projectsWithLocalChanges, synchronizeWorkspaces, workspaceSyncStatus } from '../src/client/lib/local-workspace';
import type { Project, ProjectDetail } from '../src/client/types';

const userId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const project = { id: projectId, crossfadeDurationMs: 12_000, crossfadeResetAfterUse: true, crossfadeResetDurationMs: 2_000, maxActivePlaybacks: 8, compactPlaybackThreshold: 5 } as Project;
const detail = { project, tracks: [], categories: [], playlists: [], subcategories: [], colors: [] } as unknown as ProjectDetail;
let storage: Map<string, string>;
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  storage = new Map([['sonoriva-user', JSON.stringify({ id: userId, isDemo: false })]]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetcher);
  await mergeWorkspace(userId, structuredClone(detail));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function online(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  fetcher.mockImplementation((url: string, init?: RequestInit) => url === '/api/auth/me' ? Promise.resolve(Response.json({ user: { id: userId } })) : handler(url, init));
}

describe('fondus enregistrés hors connexion', () => {
  it('applique une seconde et conserve le réglage à la réouverture et après un rafraîchissement', async () => {
    expect((await api.updateProjectActions(projectId, { crossfadeDurationMs: 1_000 })).project.crossfadeDurationMs).toBe(1_000);
    expect(fetcher).not.toHaveBeenCalled();
    await mergeWorkspace(userId, structuredClone(detail));
    // An older interface can still replace the project snapshot, without replacing its journal.
    await changeRawWorkspace(userId, projectId, (record) => ({ ...record!, detail: structuredClone(detail) }));
    expect((await localProject(projectId)).project.crossfadeDurationMs).toBe(1_000);
    expect((await projectsWithLocalChanges([project]))[0].crossfadeDurationMs).toBe(1_000);
    expect((await workspaceSyncStatus(projectId)).playbackSettings?.changes).toEqual({ crossfadeDurationMs: 1_000 });
  });

  it('réinitialise le fondu après le deuxième son sans requête en ligne et conserve les catégories', async () => {
    await api.updateProjectActions(projectId, { crossfadeDurationMs: 1_000, crossfadeResetAfterUse: true });
    const category = (await api.createCategory(projectId, 'Scène', '#abcdef')).category;
    await api.updateProjectActions(projectId, { crossfadeDurationMs: 2_000 });
    const reopened = (await readWorkspace(userId, projectId))!;
    expect(reopened.detail.project).toMatchObject({ crossfadeDurationMs: 2_000, crossfadeResetAfterUse: true });
    expect(reopened.detail.categories[0].id).toBe(category.id);
    expect(reopened.entities).toHaveProperty(`category:${category.id}`);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('synchronise seulement les paramètres modifiés au retour de la connexion', async () => {
    await api.updateProjectActions(projectId, { crossfadeDurationMs: 1_000 });
    online(async (url, init) => {
      expect(url).toBe(`/api/projects/${projectId}/mouse-actions`);
      expect(JSON.parse(String(init?.body))).toEqual({ crossfadeDurationMs: 1_000 });
      return Response.json({ project: { ...project, crossfadeDurationMs: 1_000, compactPlaybackThreshold: 3 } });
    });
    await synchronizeWorkspaces();
    const reopened = (await readWorkspace(userId, projectId))!;
    expect(reopened.playbackSettings).toBeUndefined();
    expect(reopened.detail.project).toMatchObject({ crossfadeDurationMs: 1_000, compactPlaybackThreshold: 3 });
  });

  it('conserve un retour à l’ancienne valeur pendant une réponse retardée', async () => {
    await api.updateProjectActions(projectId, { crossfadeDurationMs: 1_000 });
    let finish!: (value: Response) => void;
    online(async () => new Promise<Response>((resolve) => { finish = resolve; }));
    const sending = synchronizeWorkspaces();
    await vi.waitFor(() => expect(finish).toBeDefined());
    await api.updateProjectActions(projectId, { crossfadeDurationMs: 12_000 });
    finish(Response.json({ project: { ...project, crossfadeDurationMs: 1_000 } }));
    await sending;
    expect((await readWorkspace(userId, projectId))!.detail.project.crossfadeDurationMs).toBe(12_000);
    online(async (_url, init) => Response.json({ project: { ...project, ...JSON.parse(String(init?.body)) } }));
    await synchronizeWorkspaces();
    expect((await readWorkspace(userId, projectId))!.playbackSettings).toBeUndefined();
    expect((await readWorkspace(userId, projectId))!.detail.project.crossfadeDurationMs).toBe(12_000);
  });

  it('conserve les refus serveur et permet une nouvelle tentative sans perdre la valeur locale', async () => {
    await api.updateProjectActions(projectId, { crossfadeDurationMs: 1_000 });
    online(async () => Response.json({ error: 'Espace en lecture seule' }, { status: 403 }));
    await synchronizeWorkspaces();
    expect((await workspaceSyncStatus(projectId)).playbackSettings?.error).toBe('Espace en lecture seule');
    expect((await readWorkspace(userId, projectId))!.detail.project.crossfadeDurationMs).toBe(1_000);
    online(async () => Response.json({ project: { ...project, crossfadeDurationMs: 1_000 } }));
    await synchronizeWorkspaces(true);
    expect((await workspaceSyncStatus(projectId)).playbackSettings).toBeUndefined();
  });

  it('signale les échecs de stockage, les valeurs invalides et les espaces en lecture seule', async () => {
    await expect(api.updateProjectActions(projectId, { crossfadeDurationMs: 20_001 })).rejects.toThrow('invalide');
    storage.set(`sonoriva-account:${userId}`, JSON.stringify({ accessStatus: 'read_only' }));
    await expect(api.updateProjectActions(projectId, { crossfadeDurationMs: 1_000 })).rejects.toThrow('lecture seule');
    storage.delete(`sonoriva-account:${userId}`);
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Disque plein', 'QuotaExceededError'); });
    await expect(api.updateProjectActions(projectId, { crossfadeDurationMs: 1_000 })).rejects.toThrow('Disque plein');
    expect((await readWorkspace(userId, projectId))!.detail.project.crossfadeDurationMs).toBe(12_000);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
