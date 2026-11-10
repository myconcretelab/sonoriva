import { clearPlaylistDependencyErrors, synchronizeEntityPhase, trackCategoryReady } from './entity-sync';
import { desktopHost } from './desktop';
import { ApiError, request } from './api-transport';
import { changeWorkspace, changeWorkspaceJournal, listWorkspaces, mergeWorkspace, playbackSettingKeys, readLocalMedia, readWorkspace, trackChanges, type PendingPlaybackSettings, type PlaybackSettings, type PendingTrack, type TrackChanges } from './local-workspace-store';
import type { Project, ProjectDetail, Track, User } from '../types';

export function localUser(): User | undefined {
  try {
    const user = JSON.parse(localStorage.getItem('sonoriva-user') ?? 'null') as User | null;
    return user && typeof user.id === 'string' && !user.isDemo && (Boolean(desktopHost()) || typeof indexedDB !== 'undefined') ? user : undefined;
  } catch { return undefined; }
}

function changed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('sonoriva:local-workspace-changed'));
}

function projectChanged() {
  changed();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sonoriva:project-updated'));
    window.dispatchEvent(new Event('sonoriva:local-workspace-write'));
    channel?.postMessage('changed');
  }
}

const refreshing = new Map<string, Promise<ProjectDetail>>();
async function fetchProject(user: User, id: string): Promise<ProjectDetail> {
  const key = `${user.id}:${id}`;
  const pending = refreshing.get(key);
  if (pending) return pending;
  const loading = (async () => {
    const started = await readWorkspace(user.id, id).catch(() => undefined);
    const detail = await request<ProjectDetail>(`/api/projects/${id}`, { signal: AbortSignal.timeout(3_000) });
    if (localUser()?.id !== user.id) throw new Error('La session locale a changé.');
    const previous = await readWorkspace(user.id, id).catch(() => undefined);
    const merged = await mergeWorkspace(user.id, detail, started?.revision ?? 0).catch(() => previous ?? { detail });
    if (JSON.stringify(previous?.detail) !== JSON.stringify(merged.detail)) projectChanged();
    return merged.detail;
  })();
  refreshing.set(key, loading);
  try { return await loading; } finally { refreshing.delete(key); }
}

export async function localProject(id: string): Promise<ProjectDetail> {
  const user = localUser();
  if (!user) return request<ProjectDetail>(`/api/projects/${id}`);
  const stored = await readWorkspace(user.id, id).catch(() => undefined);
  if (stored) {
    void fetchProject(user, id).catch(() => undefined);
    return stored.detail;
  }
  return fetchProject(user, id);
}

async function trackWorkspace(userId: string, id: string) {
  return (await listWorkspaces(userId)).find((record) => record.detail.tracks.some((track) => track.id === id));
}

function writable(user: User) {
  let cached: { accessStatus?: string } | null;
  try {
    cached = JSON.parse(localStorage.getItem(`sonoriva-account:${user.id}`) ?? 'null');
  } catch { return; }
  if (cached?.accessStatus === 'read_only' || cached?.accessStatus === 'suspended') throw new Error('Votre espace est en lecture seule.');
}

export async function projectsWithLocalChanges(projects: Project[]): Promise<Project[]> {
  const user = localUser();
  if (!user) return projects;
  const workspaces = await listWorkspaces(user.id).catch(() => []);
  return [...projects.map((project) => ({ ...project, ...workspaces.find((record) => record.detail.project.id === project.id)?.playbackSettings?.changes })), ...workspaces.filter((record) => (record.playbackSettings || Object.keys(record.pending).length > 0 || Object.keys(record.entities ?? {}).length > 0) && !projects.some((project) => project.id === record.detail.project.id)).map((record) => record.detail.project)];
}

export async function editLocalPlaybackSettings(projectId: string, input: PlaybackSettings): Promise<{ project: Project } | undefined> {
  if (!Object.keys(input).length || Object.keys(input).some((key) => !playbackSettingKeys.includes(key as typeof playbackSettingKeys[number]))) return undefined;
  const user = localUser();
  if (!user || !await readWorkspace(user.id, projectId)) return undefined;
  writable(user);
  for (const key of playbackSettingKeys) {
    const value = input[key];
    if (value === undefined) continue;
    if (key === 'crossfadeResetAfterUse' ? typeof value !== 'boolean' : typeof value !== 'number' || !Number.isInteger(value) || value < (key.endsWith('Ms') ? 0 : 1) || value > (key.endsWith('Ms') ? 20_000 : 16)) throw new Error('Réglage de lecture invalide.');
  }
  await changeWorkspaceJournal(user.id, projectId, (journal) => ({ ...journal, playbackSettings: { token: crypto.randomUUID(), changes: { ...journal.playbackSettings?.changes, ...input } } }));
  const record = (await readWorkspace(user.id, projectId))!;
  projectChanged();
  return { project: record.detail.project };
}

export async function editLocalTrack(id: string, input: TrackChanges): Promise<{ track: Track } | undefined> {
  const user = localUser();
  if (!user) return undefined;
  const workspace = await trackWorkspace(user.id, id);
  if (!workspace) return undefined;
  writable(user);
  const updated = await changeWorkspace(user.id, workspace.detail.project.id, (current) => {
    if (!current) throw new Error('Spectacle absent du stockage local.');
    if (input.categoryId && !current.detail.categories.some((category) => category.id === input.categoryId)) throw new Error('Catégorie introuvable.');
    const previous = current.detail.tracks.find((track) => track.id === id)!;
    const desired = { ...previous, ...input, ...(input.categoryId !== undefined && input.categoryId !== previous.categoryId ? { subcategoryId: null } : {}) };
    const operation = current.pending[id];
    const base = operation ? operation.base : previous;
    const pending = { ...current.pending };
    if (!operation && base && Object.keys(trackChanges(base, desired)).length === 0) delete pending[id];
    else pending[id] = { base, desired, uploadFields: operation?.uploadFields };
    return { ...current, pending, detail: { ...current.detail, tracks: current.detail.tracks.map((track) => track.id === id ? desired : track) } };
  });
  projectChanged();
  return { track: updated.detail.tracks.find((track) => track.id === id)! };
}

export async function importLocalTrack(form: FormData): Promise<{ track: Track } | undefined> {
  const user = localUser();
  const projectId = String(form.get('projectId') ?? '');
  if (!user || !await readWorkspace(user.id, projectId)) return undefined;
  writable(user);
  const file = form.get('file');
  if (!(file instanceof Blob) || !('name' in file)) throw new Error('Fichier média manquant.');
  const filename = String(file.name);
  if (!/\.(mp3|wav|ogg|flac|m4a|aac|mp4|webm)$/i.test(filename)) throw new Error('Format média non pris en charge.');
  if (file.size > 250 * 1024 * 1024) throw new Error('Fichier média trop volumineux.');
  const title = String(form.get('title') ?? '').trim();
  if (!title || title.length > 160) throw new Error('Le titre doit contenir entre 1 et 160 caractères.');
  const workspace = await readWorkspace(user.id, projectId);
  const categoryId = String(form.get('categoryId') ?? '');
  if (categoryId && !workspace?.detail.categories.some((category) => category.id === categoryId)) throw new Error('Catégorie introuvable.');
  const id = crypto.randomUUID();
  const fields = [...form.entries()].flatMap(([key, value]): Array<[string, string]> => typeof value === 'string' && key !== 'clientTrackId' ? [[key, value]] : []);
  const track: Track = {
    id, projectId, title, originalFilename: filename,
    mimeType: /\.mp4$/i.test(filename) ? 'video/mp4' : /\.webm$/i.test(filename) ? 'video/webm' : file.type || 'application/octet-stream',
    sizeBytes: file.size, durationMs: Number(form.get('durationMs')) || null,
    categoryId: String(form.get('categoryId') ?? '') || null, subcategoryId: String(form.get('subcategoryId') ?? '') || null,
    startTimeMs: Number(form.get('startTimeMs')) || 0, endTimeMs: Number(form.get('endTimeMs')) || null,
    fadeInMs: Number(form.get('fadeInMs')) || 0, fadeOutMs: form.has('fadeOutMs') ? Number(form.get('fadeOutMs')) : 400,
    volume: 1, videoEndBehavior: 'black', loop: form.get('loop') === 'true', color: String(form.get('color') ?? '') || null,
    tags: [...new Set(String(form.get('tags') ?? '').split(',').map((tag) => tag.trim().replace(/^#+/, '')).filter(Boolean))],
    description: String(form.get('description') ?? '') || null, copyrightText: String(form.get('copyrightText') ?? '') || null,
    sourceUrl: String(form.get('sourceUrl') ?? '') || null, sourceId: String(form.get('sourceId') ?? '') || null,
    position: Number(form.get('position')) || 0, createdAt: new Date().toISOString(), localMedia: true,
  };
  await changeWorkspace(user.id, projectId, (current) => {
    if (!current) throw new Error('Spectacle absent du stockage local.');
    return {
      ...current, mediaIds: [...current.mediaIds, id],
      pending: { ...current.pending, [id]: { base: null, desired: track, uploadFields: fields } },
      detail: { ...current.detail, tracks: [...current.detail.tracks, track] },
    };
  }, { id, file });
  projectChanged();
  return { track };
}

export async function localMediaResponse(trackId: string): Promise<Response | undefined> {
  const user = localUser();
  if (!user) return undefined;
  const file = await readLocalMedia(user.id, trackId).catch(() => undefined);
  return file ? new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream', 'Content-Length': String(file.size) } }) : undefined;
}

export async function localMediaIds(): Promise<Set<string>> {
  const user = localUser();
  return user ? new Set((await listWorkspaces(user.id).catch(() => [])).flatMap((workspace) => workspace.mediaIds)) : new Set();
}

export async function requireSyncedTrack(trackId: string) {
  const user = localUser();
  const record = user ? await trackWorkspace(user.id, trackId) : undefined;
  if (record?.pending[trackId]) throw new Error('Synchronisez les changements de ce son avant cette opération.');
  if (Object.values(record?.entities ?? {}).some((item) => item.kind === 'playlist' && (item.desired as import('../types').Playlist | null)?.items.some((entry) => entry.trackId === trackId))) throw new Error('Ce son est utilisé par une playlist à synchroniser.');
}

export async function requireSyncedProject(projectId: string) {
  const user = localUser();
  const record = user ? await readWorkspace(user.id, projectId) : undefined;
  if (record && (record.playbackSettings || Object.keys(record.pending).length || Object.keys(record.entities ?? {}).length)) throw new Error('Ce spectacle contient des changements locaux à synchroniser.');
}

// The acknowledgement can arrive after another edit: rebase only the edits made in flight.
async function acknowledge(userId: string, projectId: string, sent: PendingTrack, server: Track) {
  await changeWorkspace(userId, projectId, (record) => {
    if (!record) throw new Error('Spectacle absent du stockage local.');
    const current = record.pending[server.id];
    const pending = { ...record.pending };
    const later = current ? trackChanges(sent.desired, current.desired) : {};
    const desired = { ...server, ...later, ...(record.mediaIds.includes(server.id) ? { localMedia: true } : {}) };
    if (Object.keys(later).length) pending[server.id] = { base: server, desired };
    else delete pending[server.id];
    return { ...record, pending, detail: { ...record.detail, tracks: record.detail.tracks.map((track) => track.id === server.id ? desired : track) } };
  });
  await clearPlaylistDependencyErrors(userId, projectId, server.id);
  projectChanged();
}

let synchronizing = false;
export function isWorkspaceSyncing() { return synchronizing; }

async function synchronize(user: User, retry: boolean) {
  const queued = await listWorkspaces(user.id);
  if (!queued.some((workspace) => [...Object.values(workspace.pending), ...Object.values(workspace.entities ?? {}), ...(workspace.playbackSettings ? [workspace.playbackSettings] : [])].some((operation) => retry || !operation.error))) return;
  // A cached identity is sufficient for local work, never for sending changes as another account.
  const identity = await request<{ user: User }>('/api/auth/me', { signal: AbortSignal.timeout(3_000) });
  if (identity.user.id !== user.id || localUser()?.id !== user.id) return;
  const budget = { remaining: 40 };
  for (const workspace of await listWorkspaces(user.id)) {
    const settings = workspace.playbackSettings;
    if (settings && (retry || !settings.error)) {
      try {
        const { project } = await request<{ project: Project }>(`/api/projects/${workspace.detail.project.id}/mouse-actions`, { method: 'PATCH', body: JSON.stringify(settings.changes), signal: AbortSignal.timeout(8_000) });
        if (localUser()?.id !== user.id) return;
        await changeWorkspace(user.id, project.id, (record) => ({ ...record!, detail: { ...record!.detail, project } }));
        await changeWorkspaceJournal(user.id, project.id, (journal) => journal.playbackSettings?.token === settings.token ? { ...journal, playbackSettings: undefined } : journal);
        projectChanged();
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status === 401) return;
        await changeWorkspaceJournal(user.id, workspace.detail.project.id, (journal) => journal.playbackSettings?.token === settings.token ? { ...journal, playbackSettings: { ...settings, error: cause.message } } : journal);
        changed();
      }
    }
    if (!await synchronizeEntityPhase(user.id, workspace.detail.project.id, 'categories', retry, budget)) return;
    for (const id of Object.keys(workspace.pending)) {
      if (localUser()?.id !== user.id) return;
      const current = await readWorkspace(user.id, workspace.detail.project.id);
      const operation = current?.pending[id];
      if (!operation || (operation.error && !retry)) continue;
      if (!current || !trackCategoryReady(current, operation.desired.categoryId)) continue;
      try {
        let result: { track: Track };
        if (operation.base === null) {
          const file = await readLocalMedia(user.id, id);
          if (!file) throw new ApiError('Le fichier local est introuvable. L’import est conservé en attente.', 400);
          const body = new FormData();
          for (const [key, value] of operation.uploadFields ?? []) body.set(key, value);
          for (const key of ['title', 'categoryId', 'subcategoryId', 'durationMs', 'startTimeMs', 'endTimeMs', 'fadeInMs', 'fadeOutMs', 'color', 'description', 'copyrightText', 'sourceUrl', 'sourceId', 'position', 'loop'] as const) {
            const value = operation.desired[key];
            if (value === null || value === undefined) body.delete(key);
            else body.set(key, String(value));
          }
          if (operation.desired.tags.length) body.set('tags', operation.desired.tags.join(','));
          else body.delete('tags');
          body.set('clientTrackId', id);
          body.set('file', file, operation.desired.originalFilename);
          result = await request('/api/tracks/upload', { method: 'POST', body, signal: AbortSignal.timeout(120_000) });
          // Edits made before the first upload are sent by the next PATCH, after the stable ID exists.
          const imported = { ...operation, desired: { ...result.track, localMedia: true } };
          await acknowledge(user.id, workspace.detail.project.id, imported, result.track);
        } else {
          const changes = trackChanges(operation.base, operation.desired);
          const offlineBase = Object.fromEntries(Object.keys(changes).map((key) => [key, operation.base![key as keyof Track] ?? null]));
          result = await request(`/api/tracks/${id}`, { method: 'PATCH', body: JSON.stringify({ ...changes, offlineBase }), signal: AbortSignal.timeout(8_000) });
          await acknowledge(user.id, workspace.detail.project.id, operation, result.track);
        }
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status === 401) return;
        await changeWorkspace(user.id, workspace.detail.project.id, (record) => {
          if (!record) throw new Error('Le stockage du spectacle n’est plus disponible.');
          if (!record.pending[id]) return record;
          const pending = { ...record.pending, [id]: { ...record.pending[id], error: cause.message, ...(cause.status === 409 && cause.body?.track ? { remote: cause.body.track as unknown as Track } : {}) } };
          return { ...record, pending };
        });
        changed();
      }
    }
    if (!await synchronizeEntityPhase(user.id, workspace.detail.project.id, 'playlists', retry, budget)) return;
    if (!await synchronizeEntityPhase(user.id, workspace.detail.project.id, 'deletions', retry, budget)) return;
  }
}

export async function synchronizeWorkspaces(retry = false): Promise<void> {
  const user = localUser();
  if (!user || synchronizing) return;
  synchronizing = true;
  changed();
  try {
    if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request(`sonoriva-sync:${user.id}`, { ifAvailable: true }, (lock) => lock ? synchronize(user, retry) : undefined);
    else await synchronize(user, retry);
  } catch { /* Local data remains authoritative until a server acknowledgement. */ }
  finally { synchronizing = false; changed(); }
}

export async function workspaceSyncStatus(projectId?: string): Promise<{ pending: PendingTrack[]; entities: import('./entity-journal').PendingEntity[]; playbackSettings?: PendingPlaybackSettings; syncing: boolean }> {
  const user = localUser();
  if (!user || !projectId) return { pending: [], entities: [], syncing: synchronizing };
  const record = await readWorkspace(user.id, projectId);
  return { pending: Object.values(record?.pending ?? {}), entities: Object.values(record?.entities ?? {}), playbackSettings: record?.playbackSettings, syncing: synchronizing };
}

export async function resolveLocalConflict(projectId: string, trackId: string, keepLocal: boolean) {
  const user = localUser();
  if (!user) return;
  await changeWorkspace(user.id, projectId, (record) => {
    if (!record) throw new Error('Spectacle absent du stockage local.');
    const operation = record.pending[trackId];
    if (!operation?.remote || !operation.base) return record;
    const pending = { ...record.pending };
    const desired = { ...operation.remote, ...(keepLocal ? trackChanges(operation.base, operation.desired) : {}), ...(record.mediaIds.includes(trackId) ? { localMedia: true } : {}) };
    if (keepLocal) pending[trackId] = { base: operation.remote, desired };
    else delete pending[trackId];
    return { ...record, pending, detail: { ...record.detail, tracks: record.detail.tracks.map((track) => track.id === trackId ? desired : track) } };
  });
  projectChanged();
  await synchronizeWorkspaces();
}

let channel: BroadcastChannel | undefined;
export function startWorkspaceSync(): () => void {
  const sync = () => { void synchronizeWorkspaces(); };
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(`sonoriva-workspaces:${localUser()?.id}`);
    channel.onmessage = () => {
      changed();
      window.dispatchEvent(new Event('sonoriva:project-updated'));
      sync();
    };
  }
  const timer = window.setInterval(sync, 15_000);
  window.addEventListener('online', sync);
  window.addEventListener('focus', sync);
  window.addEventListener('sonoriva:local-workspace-write', sync);
  sync();
  return () => {
    channel?.close(); channel = undefined;
    window.clearInterval(timer);
    window.removeEventListener('online', sync);
    window.removeEventListener('focus', sync);
    window.removeEventListener('sonoriva:local-workspace-write', sync);
  };
}
