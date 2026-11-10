import { localUser } from './local-workspace';
import type { LocalWorkspace } from './local-workspace-store';
import { changeEntityJournal, changeWorkspace, readWorkspace } from './local-workspace-store';
import { ApiError, request } from './api-transport';
import { entityChanges } from '../../server/shared/offline-entities';
import { categoryReferences, entityKey, entityKeys, removeCategoryReferences, withEntity, type CategoryReferences, type EntityKind, type PendingEntity, type WorkspaceEntity } from './entity-journal';
import type { Playlist } from '../types';

const entityIn = (record: LocalWorkspace, kind: EntityKind, id: string): WorkspaceEntity | null => (kind === 'category' ? record.detail.categories : record.detail.playlists).find((item) => item.id === id) ?? null;
function notify(project = false) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('sonoriva:local-workspace-changed'));
  if (project) window.dispatchEvent(new Event('sonoriva:project-updated'));
}
function ready(record: LocalWorkspace, operation: PendingEntity): boolean {
  if (!operation.desired) return true;
  if (operation.kind === 'playlist') {
    const playlist = operation.desired as Playlist;
    if (playlist.categoryId && record.entities?.[entityKey('category', playlist.categoryId)]?.base === null) return false;
    if (playlist.items.some((item) => record.pending[item.trackId]?.base === null)) return false;
  }
  return true;
}
export function trackCategoryReady(record: LocalWorkspace, categoryId: string | null): boolean {
  return !categoryId || record.entities?.[entityKey('category', categoryId)]?.base !== null;
}
async function acknowledge(userId: string, projectId: string, sent: PendingEntity, server: WorkspaceEntity | null) {
  const before = await readWorkspace(userId, projectId);
  if (!before) throw new Error('Spectacle absent du stockage local.');
  const key = entityKey(sent.kind, sent.id);
  const local = before.entities?.[key];
  const currentDesired = local ? local.desired : entityIn(before, sent.kind, sent.id);
  const desired = server && sent.desired && currentDesired ? { ...server, ...entityChanges(sent.desired, currentDesired, entityKeys(sent.kind)) } as WorkspaceEntity : currentDesired;
  // Persist the server snapshot first. Replaying the journal after a crash is idempotent.
  await changeWorkspace(userId, projectId, (record) => {
    if (!record) throw new Error('Spectacle absent du stockage local.');
    let detail = withEntity(record.detail, sent.kind, sent.id, server);
    if (sent.kind === 'category' && !server) detail = removeCategoryReferences(detail, sent.id);
    const pending = { ...record.pending };
    if (sent.kind === 'category' && server) for (const [id, operation] of Object.entries(pending)) {
      if (operation.desired.categoryId === sent.id && operation.error && !operation.remote) pending[id] = { ...operation, error: undefined };
    }
    return { ...record, detail, pending };
  });
  await changeEntityJournal(userId, projectId, (journal) => {
    const latest = journal[key];
    // Another edit may have happened while the snapshot was saved.
    const latestDesired = latest && latest.token !== local?.token
      ? server && sent.desired && latest.desired ? { ...server, ...entityChanges(sent.desired, latest.desired, entityKeys(sent.kind)) } as WorkspaceEntity : latest.desired
      : desired;
    const next = { ...journal };
    if ((!server && !latestDesired) || (server && latestDesired && !Object.keys(entityChanges(server, latestDesired, entityKeys(sent.kind))).length)) delete next[key];
    else next[key] = { token: crypto.randomUUID(), kind: sent.kind, id: sent.id, label: latestDesired?.name ?? latest?.label ?? sent.label, base: server, desired: latestDesired, ...(latest?.references ? { references: latest.references } : sent.references ? { references: sent.references } : {}) };
    return next;
  });
  notify();
}

export async function synchronizeEntityPhase(userId: string, projectId: string, phase: 'categories' | 'playlists' | 'deletions', retry: boolean, budget: { remaining: number }): Promise<boolean> {
  if (localUser()?.id !== userId) return false;
  const snapshot = await readWorkspace(userId, projectId);
  let changed = false;
  for (const key of Object.keys(snapshot?.entities ?? {})) {
    if (localUser()?.id !== userId) return false;
    if (budget.remaining <= 0) break;
    const record = await readWorkspace(userId, projectId);
    const operation = record?.entities?.[key];
    if (!record || !operation || (operation.error && !retry)) continue;
    if (phase === 'categories' ? operation.kind !== 'category' || !operation.desired : phase === 'playlists' ? operation.kind !== 'playlist' : operation.kind !== 'category' || operation.desired !== null) continue;
    if (!ready(record, operation)) continue;
    try {
      budget.remaining--;
      const { entity } = await request<{ entity: WorkspaceEntity | null }>(`/api/projects/${projectId}/offline/${operation.kind}/${operation.id}`, { method: 'POST', body: JSON.stringify({ actorId: userId, base: operation.base, desired: operation.desired, references: operation.references }), signal: AbortSignal.timeout(10_000) });
      if (localUser()?.id !== userId) return false;
      await acknowledge(userId, projectId, operation, entity);
      changed = true;
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status === 401 || cause.status === 429 || cause.status >= 500 || cause.body?.reason === 'actor-changed') { if (changed) notify(true); return false; }
      await changeEntityJournal(userId, projectId, (journal) => {
        if (journal[key]?.token !== operation.token) return journal;
        return { ...journal, [key]: { ...journal[key], error: cause.message, ...(cause.status === 409 && cause.body && 'entity' in cause.body ? { remote: cause.body.entity as WorkspaceEntity | null, remoteReferences: cause.body.references as CategoryReferences | undefined } : {}) } };
      });
      notify();
    }
  }
  if (changed) notify(true);
  return true;
}

export async function resolveEntityConflict(userId: string, projectId: string, key: string, keepLocal: boolean): Promise<void> {
  const record = await readWorkspace(userId, projectId);
  let resolvedId: string | undefined;
  const operation = record?.entities?.[key];
  if (!record || !operation || operation.remote === undefined) return;
  if (!keepLocal) {
    const remote = operation.remote;
    await changeWorkspace(userId, projectId, (current) => {
      if (!current) throw new Error('Spectacle absent du stockage local.');
      let detail = withEntity(current.detail, operation.kind, operation.id, remote);
      if (operation.kind === 'category' && !remote) detail = removeCategoryReferences(detail, operation.id);
      if (operation.kind === 'category' && remote && operation.remoteReferences) {
        const refs = operation.remoteReferences;
        detail = { ...detail, subcategories: [...detail.subcategories.filter((group) => !refs.subcategories.some((item) => item.id === group.id)), ...refs.subcategories], tracks: detail.tracks.map((track) => {const member = refs.tracks.find((item) => item.id === track.id);return member ? { ...track, categoryId: member.categoryId, subcategoryId: member.subcategoryId } : track;}), playlists: detail.playlists.map((playlist) => refs.playlists.includes(playlist.id) ? { ...playlist, categoryId: operation.id } : playlist) };
      }
      return { ...current, detail };
    });
    await changeEntityJournal(userId, projectId, (journal) => { if (journal[key]?.token !== operation.token) return journal; const next = { ...journal }; delete next[key]; return next; });
  } else if (operation.remote === null && operation.desired) {
    // Deleted IDs are never reused: a new ID makes old delayed requests harmless.
    const newId = crypto.randomUUID();
    resolvedId = newId;
    await changeWorkspace(userId, projectId, (current) => {
      if (!current) throw new Error('Spectacle absent du stockage local.');
      const detail = withEntity(current.detail, operation.kind, operation.id, null);
      return { ...current, detail: operation.kind === 'category' ? removeCategoryReferences(detail, operation.id) : detail };
    });
    await changeEntityJournal(userId, projectId, (journal) => {
      if (journal[key]?.token !== operation.token) return journal;
      const next = { ...journal }; delete next[key];
      const desired = { ...operation.desired!, id: newId };
      next[entityKey(operation.kind, newId)] = { token: crypto.randomUUID(), kind: operation.kind, id: newId, label: operation.label, base: null, desired };
      if (operation.kind === 'category') for (const [entryKey, item] of Object.entries(next)) if (item.kind === 'playlist' && (item.desired as Playlist | null)?.categoryId === operation.id) next[entryKey] = { ...item, token: crypto.randomUUID(), desired: { ...item.desired, categoryId: newId } as Playlist };
      return next;
    });
    if (operation.kind === 'category') await changeWorkspace(userId, projectId, (current) => {
      if (!current) throw new Error('Spectacle absent du stockage local.');
      const pending = Object.fromEntries(Object.entries(current.pending).map(([id, item]) => [id, item.desired.categoryId === operation.id ? { ...item, desired: { ...item.desired, categoryId: newId, subcategoryId: null } } : item]));
      return { ...current, pending, detail: { ...current.detail, tracks: current.detail.tracks.map((track) => track.categoryId === operation.id ? { ...track, categoryId: newId, subcategoryId: null } : track) } };
    });
  } else {
    await changeWorkspace(userId, projectId, (current) => {
      if (!current) throw new Error('Spectacle absent du stockage local.');
      return { ...current, detail: withEntity(current.detail, operation.kind, operation.id, operation.remote!) };
    });
    await changeEntityJournal(userId, projectId, (journal, current) => {
      if (journal[key]?.token !== operation.token) return journal;
      const desired = operation.desired && operation.base && operation.remote ? { ...operation.remote, ...entityChanges(operation.base, operation.desired, entityKeys(operation.kind)) } as WorkspaceEntity : operation.desired;
      return { ...journal, [key]: { token: crypto.randomUUID(), kind: operation.kind, id: operation.id, label: desired?.name ?? operation.label, base: operation.remote!, desired, ...(!desired && operation.kind === 'category' ? { references: operation.remoteReferences ?? categoryReferences(current.detail, operation.id) } : {}) } };
    });
  }
  notify(true);
  if (operation.kind === 'playlist' && typeof window !== 'undefined') {
    const latest = await readWorkspace(userId, projectId);
    window.dispatchEvent(new CustomEvent('sonoriva:playlist-conflict-resolved', { detail: { oldId: operation.id, playlist: latest?.detail.playlists.find((item) => item.id === (resolvedId ?? operation.id)) ?? null } }));
  }
}

export async function clearPlaylistDependencyErrors(userId: string, projectId: string, trackId: string) {
  await changeEntityJournal(userId, projectId, (journal) => Object.fromEntries(Object.entries(journal).map(([key, operation]) => [key, operation.kind === 'playlist' && operation.error && operation.remote === undefined && (operation.desired as Playlist | null)?.items.some((item) => item.trackId === trackId) ? { ...operation, error: undefined } : operation])));
}
