import { desktopHost, desktopRequest, DesktopError, desktopBaseUrl } from './desktop';
import { overlayEntities, type EntityJournal } from './entity-journal';
import type { Project, ProjectDetail, Track } from '../types';

export const playbackSettingKeys = ['crossfadeDurationMs', 'crossfadeResetAfterUse', 'crossfadeResetDurationMs', 'maxActivePlaybacks', 'compactPlaybackThreshold'] as const;
export type PlaybackSettings = Partial<Pick<Project, typeof playbackSettingKeys[number]>>;
export interface PendingPlaybackSettings { token: string; changes: PlaybackSettings; error?: string }

export const editableTrackKeys = ['title', 'categoryId', 'volume', 'loop', 'fadeInMs', 'fadeOutMs', 'startTimeMs', 'endTimeMs', 'videoEndBehavior', 'color', 'tags', 'backgroundImage'] as const;
export type TrackChanges = Partial<Pick<Track, typeof editableTrackKeys[number]>>;
export interface PendingTrack {
  base: Track | null;
  desired: Track;
  uploadFields?: Array<[string, string]>;
  error?: string;
  remote?: Track;
}
export interface LocalWorkspace {
  revision?: number;
  journalFor?: string;
  entities?: EntityJournal;
  playbackSettings?: PendingPlaybackSettings;
  key: string;
  userId: string;
  detail: ProjectDetail;
  pending: Record<string, PendingTrack>;
  mediaIds: string[];
}

export function trackChanges(base: Track, desired: Track): TrackChanges {
  return Object.fromEntries(editableTrackKeys.flatMap((key) => {
    const before = base[key] ?? (key === 'videoEndBehavior' ? 'black' : null);
    const after = desired[key] ?? (key === 'videoEndBehavior' ? 'black' : null);
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [[key, after]];
  })) as TrackChanges;
}

async function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('Le stockage local est indisponible dans ce navigateur.');
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('sonoriva-workspaces-v1', 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('projects', { keyPath: 'key' });
      open.result.createObjectStore('media');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Le stockage local est occupé par une autre fenêtre.'));
  });
}

async function transaction<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, result: (value: T) => void, fail: (cause: unknown) => void) => void): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let value: T;
    let failure: unknown;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = tx.onerror = () => { db.close(); reject(failure ?? tx.error ?? new Error('Enregistrement local impossible.')); };
    try { work(tx, (next) => { value = next; }, (cause) => { failure = cause; tx.abort(); }); }
    catch (cause) { failure = cause; tx.abort(); }
  });
}

export function readRawWorkspace(userId: string, projectId: string): Promise<LocalWorkspace | undefined> {
  if (desktopHost()) return nativeWorkspace(userId, projectId);
  return transaction(['projects'], 'readonly', (tx, done) => {
    const read = tx.objectStore('projects').get(`${userId}:${projectId}`);
    read.onsuccess = () => done(read.result);
  });
}

export function listRawWorkspaces(userId: string): Promise<LocalWorkspace[]> {
  if (desktopHost()) return desktopRequest<LocalWorkspace[]>('/v1/desktop/workspaces').then((records) => records.filter((record) => record.userId === userId));
  return transaction(['projects'], 'readonly', (tx, done) => {
    const read = tx.objectStore('projects').getAll();
    read.onsuccess = () => done((read.result as LocalWorkspace[]).filter((record) => record.userId === userId));
  });
}

// Read, journal change, project snapshot and optional file commit in one transaction.
export function changeRawWorkspace(userId: string, projectId: string, change: (current: LocalWorkspace | undefined) => LocalWorkspace, media?: { id: string; file: Blob }): Promise<LocalWorkspace> {
  if (desktopHost()) return changeNativeWorkspace(userId, projectId, change, media);
  return transaction(['projects', 'media'], 'readwrite', (tx, done, fail) => {
    const store = tx.objectStore('projects');
    const read = store.get(`${userId}:${projectId}`);
    read.onsuccess = () => {
      try {
        const next = { ...change(read.result), revision: ((read.result as LocalWorkspace | undefined)?.revision ?? 0) + 1 };
        store.put(next);
        if (media) tx.objectStore('media').put(media.file, `${userId}:${media.id}`);
        done(next);
      } catch (cause) {
        // Preserve the application error, including a missing project, without a partial write.
        fail(cause);
      }
    };
  });
}

// A separate workspace record keeps the journal intact when an older interface refreshes the project.
export function journalProjectId(projectId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return `journal:${projectId}`;
  return projectId.slice(0, 14) + (parseInt(projectId[14], 16) ^ 12).toString(16) + projectId.slice(15);
}
export function composeWorkspace(record: LocalWorkspace, entities: EntityJournal = {}, playbackSettings?: PendingPlaybackSettings): LocalWorkspace {
  const deleted = new Set(Object.values(entities).filter((item) => item.kind === 'category' && !item.desired).map((item) => item.id));
  const groups = new Set([...record.detail.subcategories.filter((group) => group.categoryId && deleted.has(group.categoryId)).map((group) => group.id), ...Object.values(entities).flatMap((item) => item.kind === 'category' && !item.desired ? item.references?.subcategories.map((group) => group.id) ?? [] : [])]);
  const pending = Object.fromEntries(Object.entries(record.pending).map(([id, operation]) => [id, { ...operation, desired: { ...operation.desired, ...(operation.desired.categoryId && deleted.has(operation.desired.categoryId) ? { categoryId: null, subcategoryId: null } : {}), ...(operation.desired.subcategoryId && groups.has(operation.desired.subcategoryId) ? { subcategoryId: null } : {}) } }]));
  return { ...record, pending, entities, playbackSettings, detail: overlayEntities({ ...record.detail, project: { ...record.detail.project, ...playbackSettings?.changes } }, entities) };
}
export async function readWorkspace(userId: string, projectId: string): Promise<LocalWorkspace | undefined> {
  const record = await readRawWorkspace(userId, projectId);
  if (!record) return undefined;
  const journal = await readRawWorkspace(userId, journalProjectId(projectId));
  return composeWorkspace(record, journal?.entities, journal?.playbackSettings);
}
export async function listWorkspaces(userId: string): Promise<LocalWorkspace[]> {
  const records = await listRawWorkspaces(userId);
  return records.filter((record) => !record.journalFor).map((record) => {
    const journal = records.find((journal) => journal.journalFor === record.detail.project.id);
    return composeWorkspace(record, journal?.entities, journal?.playbackSettings);
  });
}
export async function changeWorkspace(userId: string, projectId: string, change: (current: LocalWorkspace | undefined) => LocalWorkspace, media?: { id: string; file: Blob }): Promise<LocalWorkspace> {
  const journal = await readRawWorkspace(userId, journalProjectId(projectId));
  const updated = await changeRawWorkspace(userId, projectId, (raw) => {
    const next = change(raw ? composeWorkspace(raw, journal?.entities, journal?.playbackSettings) : undefined);
    const stored = { ...next }; delete stored.entities; delete stored.playbackSettings;
    return stored;
  }, media);
  const latestJournal = await readRawWorkspace(userId, journalProjectId(projectId));
  return composeWorkspace(updated, latestJournal?.entities, latestJournal?.playbackSettings);
}
export async function changeWorkspaceJournal(userId: string, projectId: string, change: (journal: LocalWorkspace, current: LocalWorkspace) => LocalWorkspace): Promise<LocalWorkspace> {
  const raw = await readRawWorkspace(userId, projectId);
  if (!raw) throw new Error('Spectacle absent du stockage local.');
  const id = journalProjectId(projectId);
  return changeRawWorkspace(userId, id, (previous) => {
    const journal = previous ?? { key: `${userId}:${id}`, userId, journalFor: projectId, pending: {}, mediaIds: [], detail: { ...raw.detail, project: { ...raw.detail.project, id }, categories: [], subcategories: [], playlists: [], tracks: [] } };
    return change(journal, composeWorkspace(raw, journal.entities, journal.playbackSettings));
  });
}
export async function changeEntityJournal(userId: string, projectId: string, change: (journal: EntityJournal, current: LocalWorkspace) => EntityJournal): Promise<EntityJournal> {
  const record = await changeWorkspaceJournal(userId, projectId, (journal, current) => ({ ...journal, entities: change(journal.entities ?? {}, current) }));
  return record.entities ?? {};
}

export function readLocalMedia(userId: string, trackId: string): Promise<Blob | undefined> {
  if (desktopHost()) return nativeMedia(userId, trackId);
  return transaction(['media'], 'readonly', (tx, done) => {
    const read = tx.objectStore('media').get(`${userId}:${trackId}`);
    read.onsuccess = () => done(read.result);
  });
}

export async function mergeWorkspace(userId: string, detail: ProjectDetail, expectedRevision?: number): Promise<LocalWorkspace> {
  return changeWorkspace(userId, detail.project.id, (previous) => {
    if (previous && expectedRevision !== undefined && previous.revision !== expectedRevision) return previous;
    const pending = { ...previous?.pending };
    const mediaIds = previous?.mediaIds ?? [];
    const tracks = detail.tracks.map((track) => {
      const operation = pending[track.id];
      if (operation?.base === null) return operation.desired;
      const changes = operation?.base ? trackChanges(operation.base, operation.desired) : {};
      const desired = { ...track, ...changes, ...(mediaIds.includes(track.id) ? { localMedia: true } : {}) };
      if (operation?.base) {
        const expected = Object.fromEntries(Object.keys(changes).map((key) => [key, operation.base![key as keyof Track]]));
        pending[track.id] = { ...operation, desired, base: { ...track, ...expected } };
      }
      return desired;
    });
    for (const operation of Object.values(pending)) if (!tracks.some((track) => track.id === operation.desired.id)) tracks.push(operation.desired);
    return { key: `${userId}:${detail.project.id}`, userId, detail: { ...detail, tracks }, pending, mediaIds };
  });
}

async function nativeWorkspace(userId: string, projectId: string): Promise<LocalWorkspace | undefined> {
  if (desktopHost()?.userId !== userId) throw new Error('Le compte ne correspond pas au Bridge associé.');
  return await desktopRequest<LocalWorkspace | null>(`/v1/desktop/workspaces/${encodeURIComponent(projectId)}`) ?? undefined;
}
async function changeNativeWorkspace(userId: string, projectId: string, change: (current: LocalWorkspace | undefined) => LocalWorkspace, media?: { id: string; file: Blob }): Promise<LocalWorkspace> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await nativeWorkspace(userId, projectId);
    const workspace = change(current);
    const form = new FormData();
    form.set('change', JSON.stringify({ expectedRevision: current?.revision ?? 0, workspace, mediaId: media?.id }));
    if (media) form.set('file', media.file, media.id);
    try { return await desktopRequest(`/v1/desktop/workspaces/${encodeURIComponent(projectId)}`, { method: 'PUT', body: form }); }
    catch (cause) { if (!(cause instanceof DesktopError) || cause.status !== 409) throw cause; }
  }
  throw new Error('Le spectacle est modifié dans une autre fenêtre. Réessayez cette modification.');
}
async function nativeMedia(userId: string, trackId: string): Promise<Blob | undefined> {
  if (desktopHost()?.userId !== userId) throw new Error('Le compte ne correspond pas au Bridge associé.');
  const response = await fetch(`${desktopBaseUrl}/v1/desktop/media/${encodeURIComponent(trackId)}`, { headers: { Authorization: `Bearer ${desktopHost()!.token}` } });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error('Lecture du fichier local impossible.');
  const workspaces = await listWorkspaces(userId);
  const track = workspaces.flatMap((record) => record.detail.tracks).find((track) => track.id === trackId);
  return new Blob([await response.blob()], { type: track?.mimeType ?? 'application/octet-stream' });
}
