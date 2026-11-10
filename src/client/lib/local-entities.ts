import { playlistRowsAreValid } from '../../server/services/playlist-rows';
import type { Category, Playlist, PlaylistEntry } from '../types';
import { categoryReferences, queueEntity, type EntityJournal, type EntityKind, type WorkspaceEntity } from './entity-journal';
import { changeEntityJournal, readWorkspace } from './local-workspace-store';
import { localUser } from './local-workspace';

function announce() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sonoriva:local-workspace-changed'));
    window.dispatchEvent(new Event('sonoriva:project-updated'));
    window.dispatchEvent(new Event('sonoriva:local-workspace-write'));
  }
}
function writable(userId: string, playlists = false) {
  const account = JSON.parse(localStorage.getItem(`sonoriva-account:${userId}`) ?? 'null');
  if (account?.accessStatus === 'read_only' || account?.accessStatus === 'suspended') throw new Error('Votre espace est en lecture seule.');
  if (playlists && account?.features?.playlists === false) throw new Error('Les playlists ne sont pas incluses dans votre forfait.');
}
async function edit(projectId: string, change: Parameters<typeof changeEntityJournal>[2], playlist = false) {
  const user = localUser();
  if (!user || !await readWorkspace(user.id, projectId)) return undefined;
  writable(user.id, playlist);
  await changeEntityJournal(user.id, projectId, change);
  announce();
  return (await readWorkspace(user.id, projectId))!;
}
function text(value: string, max: number) { const trimmed = value.trim(); if (!trimmed || trimmed.length > max) throw new Error(`Le nom doit contenir entre 1 et ${max} caractères.`); return trimmed; }
function color(value: string) { if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Couleur invalide.'); return value; }
export async function createLocalCategory(projectId: string, name: string, value: string, position?: number): Promise<{ category: Category } | undefined> {
  const id = crypto.randomUUID();
  const record = await edit(projectId, (journal, current) => {
    if (current.detail.categories.length >= 500) throw new Error('Limite de 500 catégories atteinte.');
    const nextPosition = position ?? Math.max(-1, ...current.detail.categories.map((item) => item.position)) + 1;
    if (!Number.isInteger(nextPosition) || nextPosition < 0 || nextPosition > 1_000_000) throw new Error('Position de catégorie invalide.');
    return queueEntity(journal, current.detail, 'category', id, { id, projectId, name: text(name, 80), color: color(value), position: nextPosition, backgroundImage: null });
  });
  return record ? { category: record.detail.categories.find((item) => item.id === id)! } : undefined;
}
export async function updateLocalCategory(projectId: string, id: string, input: Partial<Pick<Category, 'name' | 'color' | 'backgroundImage'>>): Promise<{ category: Category } | undefined> {
  const record = await edit(projectId, (journal, current) => {
    const previous = current.detail.categories.find((item) => item.id === id);
    if (!previous) throw new Error('Catégorie introuvable.');
    return queueEntity(journal, current.detail, 'category', id, { ...previous, ...input, ...(input.name !== undefined ? { name: text(input.name, 80) } : {}), ...(input.color !== undefined ? { color: color(input.color) } : {}) });
  });
  return record ? { category: record.detail.categories.find((item) => item.id === id)! } : undefined;
}
export async function reorderLocalCategories(projectId: string, ids: string[]): Promise<{ categories: Category[] } | undefined> {
  const record = await edit(projectId, (journal, current) => {
    if (ids.length !== current.detail.categories.length || new Set(ids).size !== ids.length || ids.some((id) => !current.detail.categories.some((item) => item.id === id))) throw new Error('Ordre des catégories invalide.');
    let next = journal;
    for (const [position, id] of ids.entries()) next = queueEntity(next, current.detail, 'category', id, { ...current.detail.categories.find((item) => item.id === id)!, position });
    return next;
  });
  return record ? { categories: record.detail.categories } : undefined;
}
export async function deleteLocalCategory(projectId: string, id: string): Promise<boolean> {
  const record = await edit(projectId, (journal, current) => {
    if (!current.detail.categories.some((item) => item.id === id)) throw new Error('Catégorie introuvable.');
    const next = queueEntity(journal, current.detail, 'category', id, null, categoryReferences(current.detail, id));
    for (const [key, operation] of Object.entries(next)) if (operation.kind === 'playlist' && (operation.desired as Playlist | null)?.categoryId === id) next[key] = { ...operation, token: crypto.randomUUID(), desired: { ...operation.desired, categoryId: null } as Playlist };
    return next;
  });
  return Boolean(record);
}
export type PlaylistInput = Pick<Playlist, 'name' | 'color' | 'autostart' | 'loop' | 'random' | 'showNextButton' | 'gapMs' | 'crossfadeMs' | 'soundboardBehavior' | 'categoryId'> & { items: PlaylistEntry[] };
export async function saveLocalPlaylist(projectId: string, playlistId: string | undefined, input: PlaylistInput): Promise<{ playlist: Playlist } | undefined> {
  const id = playlistId ?? crypto.randomUUID();
  const record = await edit(projectId, (journal, current) => {
    const previous = current.detail.playlists.find((item) => item.id === id);
    if (playlistId && !previous) throw new Error('Playlist introuvable.');
    if (input.categoryId && !current.detail.categories.some((item) => item.id === input.categoryId)) throw new Error('Catégorie de playlist invalide.');
    if (!input.items.length || input.items.length > 500 || input.items.some((item) => !current.detail.tracks.some((track) => track.id === item.trackId))) throw new Error('La playlist contient un morceau invalide.');
    let lastRow = -1;
    for (const item of input.items) {
      if (!Number.isInteger(item.rowIndex) || item.rowIndex < 0 || item.rowIndex > 499 || item.rowIndex < lastRow) throw new Error('Composition des rangées de playlist invalide.');
      lastRow = item.rowIndex;
    }
    if (!playlistRowsAreValid(input.items, current.detail.project.maxPlaylistGroupSize ?? 4)) throw new Error('La rangée dépasse la limite du spectacle.');
    for (const milliseconds of [input.gapMs, input.crossfadeMs]) if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > 30_000) throw new Error('Durée de playlist invalide.');
    const now = new Date().toISOString();
    const desired: Playlist = { id, projectId, ...input, name: text(input.name, 120), color: color(input.color), soundboardBehavior: input.soundboardBehavior ?? 'continue', position: previous?.position ?? Math.max(-1, ...current.detail.tracks.map((item) => item.position), ...current.detail.playlists.map((item) => item.position)) + 1, trackIds: input.items.map((item) => item.trackId), createdAt: previous?.createdAt ?? now, updatedAt: now };
    return queueEntity(journal, current.detail, 'playlist', id, desired);
  }, true);
  return record ? { playlist: record.detail.playlists.find((item) => item.id === id)! } : undefined;
}
export async function positionLocalPlaylist(projectId: string, id: string, position: number, categoryId?: string | null): Promise<{ playlist: Playlist } | undefined> {
  const record = await edit(projectId, (journal, current) => {
    const previous = current.detail.playlists.find((item) => item.id === id);
    if (!previous) throw new Error('Playlist introuvable.');
    if (!Number.isFinite(position) || Math.abs(position) > 1_000_000) throw new Error('Position de playlist invalide.');
    if (categoryId && !current.detail.categories.some((item) => item.id === categoryId)) throw new Error('Catégorie de playlist invalide.');
    return queueEntity(journal, current.detail, 'playlist', id, { ...previous, position, ...(categoryId !== undefined ? { categoryId } : {}) });
  }, true);
  return record ? { playlist: record.detail.playlists.find((item) => item.id === id)! } : undefined;
}
export async function deleteLocalPlaylist(projectId: string, id: string): Promise<boolean> {
  return Boolean(await edit(projectId, (journal, current) => {
    if (!current.detail.playlists.some((item) => item.id === id)) throw new Error('Playlist introuvable.');
    return queueEntity(journal, current.detail, 'playlist', id, null);
  }, true));
}
export function findEntity(detail: { categories: Category[]; playlists: Playlist[] }, kind: EntityKind, id: string): WorkspaceEntity | null {
  return (kind === 'category' ? detail.categories : detail.playlists).find((item) => item.id === id) ?? null;
}
export function pendingEntityEntries(journal: EntityJournal = {}) { return Object.entries(journal); }
