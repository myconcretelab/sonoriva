import type { ProjectDetail } from '../types';
import { bridgeClient } from './bridge-client';
import { desktopProfile } from './desktop';
import { localUser } from './local-workspace';
import { readLocalMedia, readWorkspace, type LocalWorkspace, type PendingTrack } from './local-workspace-store';

/** Explicit browser-to-native transfer. A native draft is never replaced by a browser snapshot. */
export async function prepareBridgeWorkspace(detail: ProjectDetail): Promise<void> {
  const status = await bridgeClient.discover(AbortSignal.timeout(3000));
  // Older bridges retain their existing audio-only preparation.
  if (!status.capabilities?.includes('localConsole')) return;
  const user = localUser();
  if (!user) throw new Error('Utilisateur local introuvable.');
  const bootstrap = await bridgeClient.localConsoleRequest<{ userId: string }>('/bootstrap');
  if (bootstrap.userId !== user.id) throw new Error('Le Bridge est associé à un autre utilisateur.');
  const source = await readWorkspace(user.id, detail.project.id);
  if (!source) throw new Error('Le spectacle est absent du stockage du navigateur.');
  let target = await bridgeClient.localConsoleRequest<LocalWorkspace | null>(`/workspaces/${detail.project.id}`);
  if (target && Object.entries(target.pending).some(([id, pending]) => !samePending(pending, source.pending[id]))) throw new Error('La régie locale contient des changements à synchroniser. Ouvrez-la pour les synchroniser avant de remplacer sa copie.');
  const mediaIds = new Set(target?.mediaIds ?? []);
  const write = async (media?: { id: string; file: Blob }) => {
    if (media) mediaIds.add(media.id);
    // A new local import enters the native snapshot and journal together with its file.
    // Interrupted copies can be resumed without leaving an upload with no native file.
    const nativeOnly = (target?.detail?.tracks ?? []).filter((track) => mediaIds.has(track.id) && !source.detail.tracks.some((sourceTrack) => sourceTrack.id === track.id));
    const tracks = [...source.detail.tracks.filter((track) => !source.mediaIds.includes(track.id) || mediaIds.has(track.id)).map((track) => mediaIds.has(track.id) ? { ...track, localMedia: true } : track), ...nativeOnly.map((track) => ({ ...track, localMedia: true }))];
    const visibleIds = new Set(tracks.map((track) => track.id));
    const workspace = { ...source, detail: { ...source.detail, tracks }, pending: Object.fromEntries(Object.entries(source.pending).filter(([id]) => visibleIds.has(id))), mediaIds: [...mediaIds].filter((id) => visibleIds.has(id)) };
    const form = new FormData();
    form.set('change', JSON.stringify({ expectedRevision: target?.revision ?? 0, workspace, mediaId: media?.id }));
    if (media) form.set('file', media.file, media.id);
    target = await bridgeClient.localConsoleRequest<LocalWorkspace>(`/workspaces/${detail.project.id}`, { method: 'PUT', body: form });
  };
  await write();
  for (const id of source.mediaIds) {
    if (mediaIds.has(id)) continue;
    const file = await readLocalMedia(user.id, id);
    if (!file) throw new Error('Un fichier importé est absent du navigateur.');
    await write({ id, file });
  }
  // Videos also live in the native data directory, independently from the browser cache.
  for (const track of source.detail.tracks) if (!track.localMedia && !mediaIds.has(track.id)) await bridgeClient.preload(track);
  await bridgeClient.localConsoleRequest('/profile', { method: 'PUT', body: JSON.stringify(desktopProfile()) });
}

function samePending(first: PendingTrack, second: PendingTrack | undefined): boolean {
  if (!second) return false;
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
  return JSON.stringify(stable({ base: first.base, desired: first.desired, uploadFields: first.uploadFields })) === JSON.stringify(stable({ base: second.base, desired: second.desired, uploadFields: second.uploadFields }));
}
