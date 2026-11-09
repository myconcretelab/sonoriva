import type { ProjectDetail, Track } from '../types';

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

export function readWorkspace(userId: string, projectId: string): Promise<LocalWorkspace | undefined> {
  return transaction(['projects'], 'readonly', (tx, done) => {
    const read = tx.objectStore('projects').get(`${userId}:${projectId}`);
    read.onsuccess = () => done(read.result);
  });
}

export function listWorkspaces(userId: string): Promise<LocalWorkspace[]> {
  return transaction(['projects'], 'readonly', (tx, done) => {
    const read = tx.objectStore('projects').getAll();
    read.onsuccess = () => done((read.result as LocalWorkspace[]).filter((record) => record.userId === userId));
  });
}

// Read, journal change, project snapshot and optional file commit in one transaction.
export function changeWorkspace(userId: string, projectId: string, change: (current: LocalWorkspace | undefined) => LocalWorkspace, media?: { id: string; file: Blob }): Promise<LocalWorkspace> {
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

export function readLocalMedia(userId: string, trackId: string): Promise<Blob | undefined> {
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
