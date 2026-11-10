import type { Category, Playlist, ProjectDetail, TrackSubcategory } from '../types';
import { categoryKeys, entityChanges, playlistKeys } from '../../server/shared/offline-entities';
export type EntityKind = 'category' | 'playlist';
export type WorkspaceEntity = Category | Playlist;
export interface CategoryReferences {
  tracks: Array<{ id: string; categoryId: string | null; subcategoryId: string | null }>;
  subcategories: TrackSubcategory[];
  playlists: string[];
}
export interface PendingEntity {
  token: string;
  kind: EntityKind;
  id: string;
  base: WorkspaceEntity | null;
  desired: WorkspaceEntity | null;
  label: string;
  references?: CategoryReferences;
  error?: string;
  remote?: WorkspaceEntity | null;
  remoteReferences?: CategoryReferences;
}
export type EntityJournal = Record<string, PendingEntity>;
export const entityKey = (kind: EntityKind, id: string) => `${kind}:${id}`;
export const entityKeys = (kind: EntityKind) => kind === 'category' ? categoryKeys : playlistKeys;
export function categoryReferences(detail: ProjectDetail, id: string): CategoryReferences {
  const subcategories = detail.subcategories.filter((group) => group.categoryId === id);
  const groups = new Set(subcategories.map((group) => group.id));
  return { tracks: detail.tracks.filter((track) => track.categoryId === id || (track.subcategoryId && groups.has(track.subcategoryId))).map(({ id, categoryId, subcategoryId }) => ({ id, categoryId, subcategoryId })), subcategories, playlists: detail.playlists.filter((playlist) => playlist.categoryId === id).map((playlist) => playlist.id) };
}
export function withEntity(detail: ProjectDetail, kind: EntityKind, id: string, entity: WorkspaceEntity | null): ProjectDetail {
  if (kind === 'category') return { ...detail, categories: [...detail.categories.filter((item) => item.id !== id), ...(entity ? [entity as Category] : [])].sort((a,b) => a.position - b.position || a.id.localeCompare(b.id)) };
  return { ...detail, playlists: [...detail.playlists.filter((item) => item.id !== id), ...(entity ? [entity as Playlist] : [])].sort((a,b) => a.position - b.position || a.id.localeCompare(b.id)) };
}
export function overlayEntities(detail: ProjectDetail, journal: EntityJournal): ProjectDetail {
  let result = detail;
  for (const operation of Object.values(journal)) {
    const list = operation.kind === 'category' ? result.categories : result.playlists;
    const remote = list.find((item) => item.id === operation.id);
    const desired = operation.desired && operation.base && remote ? { ...remote, ...entityChanges(operation.base, operation.desired, entityKeys(operation.kind)) } : operation.desired;
    result = withEntity(result, operation.kind, operation.id, desired);
  }
  for (const operation of Object.values(journal)) if (operation.kind === 'category' && !operation.desired) result = removeCategoryReferences(result, operation.id);
  return result;
}
export function removeCategoryReferences(detail: ProjectDetail, id: string): ProjectDetail {
  const groups = new Set(detail.subcategories.filter((group) => group.categoryId === id).map((group) => group.id));
  return { ...detail, subcategories: detail.subcategories.filter((group) => !groups.has(group.id)), tracks: detail.tracks.map((track) => ({ ...track, ...(track.categoryId === id ? { categoryId: null } : {}), ...(track.subcategoryId && groups.has(track.subcategoryId) ? { subcategoryId: null } : {}) })), playlists: detail.playlists.map((playlist) => playlist.categoryId === id ? { ...playlist, categoryId: null } : playlist) };
}
export function queueEntity(journal: EntityJournal, detail: ProjectDetail, kind: EntityKind, id: string, desired: WorkspaceEntity | null, references?: CategoryReferences): EntityJournal {
  const key = entityKey(kind, id), previous = journal[key];
  const visible = (kind === 'category' ? detail.categories : detail.playlists).find((item) => item.id === id) ?? null;
  let base = previous ? previous.base : visible;
  if (previous?.base && previous.desired && visible) {
    const changed = entityChanges(previous.base, previous.desired, entityKeys(kind));
    base = { ...visible, ...Object.fromEntries(Object.keys(changed).map((key) => [key, (previous.base as unknown as Record<string, unknown>)[key]])) } as WorkspaceEntity;
    // A reverted field may already have reached the server in an earlier request.
    if (desired) for (const key of Object.keys(changed)) {
      if (JSON.stringify((desired as unknown as Record<string, unknown>)[key]) === JSON.stringify((previous.base as unknown as Record<string, unknown>)[key])) {
        base = { ...base, [key]: (previous.desired as unknown as Record<string, unknown>)[key] } as WorkspaceEntity;
      }
    }
  }
  // Retain a delete for a cancelled creation: it prevents a delayed create request from resurrecting it.
  if (!desired && !base && previous?.desired) base = previous.desired;
  const next = { ...journal };
  if (base && desired && !Object.keys(entityChanges(base, desired, entityKeys(kind))).length) delete next[key];
  else next[key] = { token: crypto.randomUUID(), kind, id, base, desired, label: desired?.name ?? previous?.label ?? base?.name ?? 'Élément supprimé', ...(references ? { references } : previous?.references ? { references: previous.references } : {}) };
  return next;
}
