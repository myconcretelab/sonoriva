import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/client/lib/api';
import { editLocalTrack, importLocalTrack, localMediaResponse, localProject, resolveLocalConflict, synchronizeWorkspaces, workspaceSyncStatus } from '../src/client/lib/local-workspace';
import { listWorkspaces, mergeWorkspace, readLocalMedia, readWorkspace } from '../src/client/lib/local-workspace-store';
import type { ProjectDetail, Track } from '../src/client/types';

const userId = 'user-local';
const projectId = '11111111-1111-4111-8111-111111111111';
const sound: Track = {
  id: '22222222-2222-4222-8222-222222222222', projectId, title: 'Ouverture', originalFilename: 'ouverture.wav',
  mimeType: 'audio/wav', sizeBytes: 4, durationMs: 60_000, categoryId: null, subcategoryId: null, startTimeMs: 0, endTimeMs: null,
  volume: 1, loop: false, fadeInMs: 0, fadeOutMs: 400, color: null, tags: [], description: null, copyrightText: null,
  sourceUrl: null, sourceId: null, position: 0, createdAt: '2026-11-09T00:00:00.000Z',
};
const detail = { project: { id: projectId }, tracks: [sound], categories: [], playlists: [], subcategories: [], colors: [] } as unknown as ProjectDetail;
let storage: Map<string, string>;
let network: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  storage = new Map([['sonoriva-user', JSON.stringify({ id: userId, isDemo: false })]]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  network = vi.fn(async () => { throw new TypeError('Offline'); });
  vi.stubGlobal('fetch', network);
  await mergeWorkspace(userId, structuredClone(detail));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function form() {
  const data = new FormData();
  data.set('projectId', projectId); data.set('title', 'Nouveau son'); data.set('file', new Blob(['WAVE'], { type: 'audio/wav' }), 'nouveau.wav');
  return data;
}
function connected(patch: (url: string, init?: RequestInit) => Promise<Response>) {
  network.mockImplementation(async (url: string, init?: RequestInit) => url === '/api/auth/me' ? Response.json({ user: { id: userId } }) : patch(url, init));
}

describe('spectacle local et synchronisation', () => {
  it('conserve les réglages après réouverture et refuse de les effacer par un rafraîchissement serveur', async () => {
    await api.updateTrack(sound.id, { title: 'Entrée', volume: .16, fadeInMs: 2_000 });
    await mergeWorkspace(userId, detail);
    expect((await localProject(projectId)).tracks[0]).toMatchObject({ title: 'Entrée', volume: .16, fadeInMs: 2_000 });
    expect((await readWorkspace(userId, projectId))!.pending[sound.id].base?.volume).toBe(1);
  });

  it('applique ensemble deux modifications concurrentes sans perdre l’une des deux', async () => {
    await Promise.all([editLocalTrack(sound.id, { title: 'Entrée' }), editLocalTrack(sound.id, { volume: .16 })]);
    expect((await readWorkspace(userId, projectId))!.detail.tracks[0]).toMatchObject({ title: 'Entrée', volume: .16 });
  });

  it('copie le fichier et son journal dans la même transaction et le joue sans réseau', async () => {
    const imported = (await importLocalTrack(form()))!.track;
    expect(imported.localMedia).toBe(true);
    expect(await (await localMediaResponse(imported.id))!.text()).toBe('WAVE');
    expect((await readWorkspace(userId, projectId))!.detail.tracks).toHaveLength(2);
    expect((await workspaceSyncStatus(projectId)).pending[0].desired.id).toBe(imported.id);
    expect(network).not.toHaveBeenCalled();
  });

  it('acquitte un import sans tags avec les valeurs par défaut du serveur sans PATCH parasite', async () => {
    const imported = (await importLocalTrack(form()))!.track;
    connected(async (_url, init) => {
      expect((init!.body as FormData).has('tags')).toBe(false);
      return Response.json({ track: { ...imported, videoEndBehavior: 'black', localMedia: undefined, backgroundImage: null } });
    });
    await synchronizeWorkspaces();
    expect((await workspaceSyncStatus(projectId)).pending).toHaveLength(0);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('annule aussi le journal et la carte si le stockage du fichier échoue', async () => {
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === 'media') throw new DOMException('Disque plein', 'QuotaExceededError');
      return original.apply(this, args);
    });
    await expect(importLocalTrack(form())).rejects.toThrow('Disque plein');
    expect((await readWorkspace(userId, projectId))!.detail.tracks).toHaveLength(1);
    expect((await workspaceSyncStatus(projectId)).pending).toHaveLength(0);
  });

  it('synchronise les champs changés avec leur version de départ', async () => {
    await editLocalTrack(sound.id, { volume: .16 });
    connected(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ volume: .16, offlineBase: { volume: 1 } });
      return Response.json({ track: { ...sound, volume: .16 } });
    });
    await synchronizeWorkspaces();
    expect((await workspaceSyncStatus(projectId)).pending).toHaveLength(0);
    expect((await readWorkspace(userId, projectId))!.detail.tracks[0].volume).toBe(.16);
  });

  it('conserve puis rejoue une opération dont la réponse a été perdue', async () => {
    await editLocalTrack(sound.id, { volume: .16 });
    connected(async () => { throw new TypeError('Réponse perdue'); });
    await synchronizeWorkspaces();
    expect((await workspaceSyncStatus(projectId)).pending).toHaveLength(1);
    connected(async () => Response.json({ track: { ...sound, volume: .16 } }));
    await synchronizeWorkspaces();
    expect((await workspaceSyncStatus(projectId)).pending).toHaveLength(0);
  });

  it.each([.5, 1])('préserve la modification à %s effectuée pendant l’envoi', async (volume) => {
    await editLocalTrack(sound.id, { volume: .16 });
    let finish!: (response: Response) => void;
    connected(async () => new Promise<Response>((resolve) => { finish = resolve; }));
    const sending = synchronizeWorkspaces();
    await vi.waitFor(() => expect(finish).toBeDefined());
    await editLocalTrack(sound.id, { volume });
    finish(Response.json({ track: { ...sound, volume: .16 } }));
    await sending;
    const pending = (await workspaceSyncStatus(projectId)).pending[0];
    expect(pending.base?.volume).toBe(.16);
    expect(pending.desired.volume).toBe(volume);
    connected(async () => Response.json({ track: { ...sound, volume } }));
    await synchronizeWorkspaces();
    expect((await workspaceSyncStatus(projectId)).pending).toHaveLength(0);
  });

  it('importe sous un identifiant stable puis transmet les réglages modifiés avant l’envoi', async () => {
    const imported = (await importLocalTrack(form()))!.track;
    await editLocalTrack(imported.id, { volume: .16 });
    connected(async (url, init) => {
      expect(url).toBe('/api/tracks/upload');
      expect((init!.body as FormData).get('clientTrackId')).toBe(imported.id);
      return Response.json({ track: { ...imported, localMedia: undefined } });
    });
    await synchronizeWorkspaces();
    expect((await workspaceSyncStatus(projectId)).pending[0].desired.volume).toBe(.16);
    connected(async (url, init) => {
      expect(url).toBe(`/api/tracks/${imported.id}`);
      expect(JSON.parse(String(init!.body))).toMatchObject({ volume: .16, offlineBase: { volume: 1 } });
      return Response.json({ track: { ...imported, volume: .16 } });
    });
    await synchronizeWorkspaces();
    expect((await workspaceSyncStatus(projectId)).pending).toHaveLength(0);
    expect(await (await localMediaResponse(imported.id))!.text()).toBe('WAVE');
  });

  it('conserve la version locale en conflit et permet de choisir ses changements', async () => {
    await editLocalTrack(sound.id, { volume: .16 });
    const remote = { ...sound, title: 'Titre ailleurs', volume: .8 };
    connected(async () => Response.json({ error: 'Conflit', track: remote }, { status: 409 }));
    await synchronizeWorkspaces();
    expect((await workspaceSyncStatus(projectId)).pending[0]).toMatchObject({ error: 'Conflit', remote: { volume: .8 }, desired: { volume: .16 } });
    connected(async (_url, init) => {
      expect(JSON.parse(String(init!.body))).toEqual({ volume: .16, offlineBase: { volume: .8 } });
      return Response.json({ track: { ...remote, volume: .16 } });
    });
    await resolveLocalConflict(projectId, sound.id, true);
    expect((await readWorkspace(userId, projectId))!.detail.tracks[0]).toMatchObject({ title: 'Titre ailleurs', volume: .16 });
    expect((await workspaceSyncStatus(projectId)).pending).toHaveLength(0);
  });

  it('accepte explicitement la version serveur sans renvoyer les changements locaux', async () => {
    await editLocalTrack(sound.id, { volume: .16 });
    connected(async () => Response.json({ error: 'Conflit', track: { ...sound, volume: .8 } }, { status: 409 }));
    await synchronizeWorkspaces();
    network.mockClear();
    await resolveLocalConflict(projectId, sound.id, false);
    expect((await readWorkspace(userId, projectId))!.detail.tracks[0].volume).toBe(.8);
    expect(network).not.toHaveBeenCalled();
  });

  it('conserve les fichiers au quota serveur dépassé sans réessayer en boucle', async () => {
    const imported = (await importLocalTrack(form()))!.track;
    connected(async () => Response.json({ error: 'Quota atteint' }, { status: 413 }));
    await synchronizeWorkspaces();
    const calls = network.mock.calls.length;
    await synchronizeWorkspaces();
    expect(network).toHaveBeenCalledTimes(calls);
    expect((await workspaceSyncStatus(projectId)).pending[0].error).toBe('Quota atteint');
    expect(await (await localMediaResponse(imported.id))!.text()).toBe('WAVE');
  });

  it('ne transmet jamais le journal d’un autre utilisateur connecté', async () => {
    await editLocalTrack(sound.id, { volume: .16 });
    network.mockResolvedValue(Response.json({ user: { id: 'another-user' } }));
    await synchronizeWorkspaces();
    expect(network).toHaveBeenCalledOnce();
    expect((await workspaceSyncStatus(projectId)).pending).toHaveLength(1);
    storage.set('sonoriva-user', JSON.stringify({ id: 'another-user' }));
    expect((await workspaceSyncStatus(projectId)).pending).toHaveLength(0);
    expect(await listWorkspaces('another-user')).toHaveLength(0);
    expect(await readLocalMedia('another-user', sound.id)).toBeUndefined();
  });

  it('ne transforme pas une modification distante sur un autre champ en modification locale', async () => {
    await editLocalTrack(sound.id, { volume: .16 });
    await mergeWorkspace(userId, { ...detail, tracks: [{ ...sound, title: 'Titre ailleurs' }] });
    await editLocalTrack(sound.id, { loop: true });
    connected(async (_url, init) => {
      expect(JSON.parse(String(init!.body))).toEqual({ volume: .16, loop: true, offlineBase: { volume: 1, loop: false } });
      return Response.json({ track: { ...sound, title: 'Titre ailleurs', volume: .16, loop: true } });
    });
    await synchronizeWorkspaces();
  });

  it('empêche une suppression qui rendrait un journal local inaccessible', async () => {
    await editLocalTrack(sound.id, { volume: .16 });
    await expect(api.deleteTrack(sound.id)).rejects.toThrow('Synchronisez');
    await expect(api.deleteProject(projectId)).rejects.toThrow('changements locaux');
    expect(network).not.toHaveBeenCalled();
  });

  it('préserve un acquittement local si une ancienne réponse de lecture arrive ensuite', async () => {
    const staleRevision = (await readWorkspace(userId, projectId))!.revision;
    await editLocalTrack(sound.id, { volume: .16 });
    connected(async () => Response.json({ track: { ...sound, volume: .16 } }));
    await synchronizeWorkspaces();
    await mergeWorkspace(userId, detail, staleRevision);
    expect((await readWorkspace(userId, projectId))!.detail.tracks[0].volume).toBe(.16);
    expect((await workspaceSyncStatus(projectId)).pending).toHaveLength(0);
  });

  it('garde accessible le spectacle local modifié même si le serveur le retire de la liste', async () => {
    await editLocalTrack(sound.id, { volume: .16 });
    network.mockResolvedValue(Response.json({ projects: [] }));
    expect((await api.projects()).projects.map((project) => project.id)).toEqual([projectId]);
  });

  it('ouvre encore le spectacle en ligne lorsque le stockage du navigateur est refusé', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new DOMException('Stockage refusé', 'SecurityError'); } });
    network.mockResolvedValue(Response.json(detail));
    expect((await localProject(projectId)).tracks[0].id).toBe(sound.id);
    await expect(editLocalTrack(sound.id, { volume: .16 })).rejects.toThrow('Stockage refusé');
  });
});
