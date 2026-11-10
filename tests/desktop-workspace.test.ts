// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changeWorkspace, readLocalMedia, readWorkspace, journalProjectId, type LocalWorkspace } from '../src/client/lib/local-workspace-store';
import { request } from '../src/client/lib/api-transport';
import { desktopRequest } from '../src/client/lib/desktop';
import { api } from '../src/client/lib/api';

const user = '11111111-1111-4111-8111-111111111111';
const project = '22222222-2222-4222-8222-222222222222';
const initial = { key: `${user}:${project}`, userId: user, detail: { project: { id: project }, tracks: [], categories: [], subcategories: [], playlists: [], colors: [] }, pending: {}, mediaIds: [], revision: 1 } as unknown as LocalWorkspace;
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  Object.defineProperty(window, '__SONORIVA_DESKTOP__', { configurable: true, value: { userId: user, deviceId: 'device', token: 'native-token' } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.defineProperty(window, '__SONORIVA_DESKTOP__', { configurable: true, value: undefined }); });

describe('stockage de la régie native', () => {
  it('enregistre et rouvre le fondu sur le disque du Bridge sans accès au cloud', async () => {
    localStorage.setItem('sonoriva-user', JSON.stringify({ id: user, isDemo: false }));
    const records = new Map<string, LocalWorkspace>([[project, structuredClone(initial)]]);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(String(url)).toContain('/v1/desktop/workspaces/');
      const id = decodeURIComponent(String(url).split('/').at(-1)!);
      if (init?.method !== 'PUT') return Response.json(records.get(id) ?? null);
      const { expectedRevision, workspace } = JSON.parse(String((init.body as FormData).get('change')));
      expect(expectedRevision).toBe(records.get(id)?.revision ?? 0);
      records.set(id, { ...workspace, revision: expectedRevision + 1 });
      return Response.json(records.get(id));
    });
    expect((await api.updateProjectActions(project, { crossfadeDurationMs: 1_000 })).project.crossfadeDurationMs).toBe(1_000);
    records.set(project, structuredClone(initial));
    expect((await readWorkspace(user, project))!.detail.project.crossfadeDurationMs).toBe(1_000);
    expect(records.get(journalProjectId(project))?.playbackSettings?.changes).toEqual({ crossfadeDurationMs: 1_000 });
    expect(fetcher).toHaveBeenCalled();
  });

  it('relit et réapplique une modification après un conflit de révision', async () => {
    let reads = 0, writes = 0;
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (String(_url).endsWith(journalProjectId(project))) return Response.json(null);
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer native-token');
      if (init?.method !== 'PUT') return new Response(JSON.stringify({ ...initial, revision: ++reads, mediaIds: reads === 1 ? [] : ['concurrent-media'] }));
      const form = init.body as FormData;
      const body = JSON.parse(String(form.get('change')));
      if (++writes === 1) return new Response(JSON.stringify({ error: 'Conflit' }), { status: 409 });
      expect(body.expectedRevision).toBe(2);
      expect(body.workspace.mediaIds).toEqual(['concurrent-media']);
      return new Response(JSON.stringify({ ...body.workspace, revision: 3 }));
    });
    const change = vi.fn((current) => ({ ...current!, pending: { test: { base: null, desired: { id: 'test', categoryId: null, subcategoryId: null } } } } as LocalWorkspace));
    const result = await changeWorkspace(user, project, change);
    expect(change).toHaveBeenCalledTimes(2);
    expect(result.revision).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it('envoie le fichier et son journal dans la même transaction native', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (String(_url).endsWith(journalProjectId(project))) return Response.json(null);
      if (init?.method !== 'PUT') return new Response('null');
      expect(new Headers(init.headers).has('Content-Type')).toBe(false);
      const form = init.body as FormData;
      expect(JSON.parse(String(form.get('change')))).toMatchObject({ expectedRevision: 0, mediaId: 'media-id', workspace: { mediaIds: ['media-id'] } });
      expect((form.get('file') as Blob).size).toBe(4);
      return new Response(JSON.stringify({ ...initial, revision: 1 }));
    });
    await changeWorkspace(user, project, () => ({ ...initial, mediaIds: ['media-id'] }), { id: 'media-id', file: new Blob(['WAVE']) });
  });
  it('refuse un autre utilisateur et les erreurs disque sans secours silencieux dans le navigateur', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Disque plein' }), { status: 400 }));
    await expect(readWorkspace('another-user', project)).rejects.toThrow('compte');
    expect(fetcher).not.toHaveBeenCalled();
    await expect(changeWorkspace(user, project, () => initial)).rejects.toThrow('Disque plein');
    await expect(readLocalMedia('another-user', 'media')).rejects.toThrow('compte');
  });
  it('conserve l’utilisateur local quand le cloud est inaccessible ou exige une reconnexion', async () => {
    const revoked = vi.fn(); window.addEventListener('sonoriva:session-revoked', revoked);
    for (const status of [401, 503]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status }));
      await expect(request('/api/auth/me')).rejects.toBeInstanceOf(TypeError);
    }
    expect(revoked).not.toHaveBeenCalled();
    window.removeEventListener('sonoriva:session-revoked', revoked);
  });
  it('conserve les refus de synchronisation et les erreurs de transaction explicites', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Quota dépassé' }), { status: 403 }));
    await expect(request('/api/tracks/upload', { method: 'POST', body: new FormData() })).rejects.toMatchObject({ status: 403 });
    await expect(desktopRequest('/v1/desktop/profile', { method: 'PUT', body: '{}' })).rejects.toMatchObject({ status: 403 });
  });
});
