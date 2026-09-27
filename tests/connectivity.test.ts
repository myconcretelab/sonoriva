import { afterEach, expect, it, vi } from 'vitest';
import { checkServerConnection } from '../src/client/lib/connectivity';
afterEach(() => vi.unstubAllGlobals());
it('vérifie réellement le serveur sans utiliser le cache HTTP', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: 'ok' }));
  vi.stubGlobal('fetch', fetcher);
  expect(await checkServerConnection(new AbortController().signal)).toBe(true);
  expect(fetcher).toHaveBeenCalledWith('/api/health', expect.objectContaining({ cache: 'no-store' }));
});
it.each([new Response('portail captif'), Response.json({ status: 'error' }, { status: 503 })])('refuse une réponse qui ne confirme pas la santé du serveur', async (response) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  expect(await checkServerConnection(new AbortController().signal)).toBe(false);
});
it('signale une coupure réseau', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
  expect(await checkServerConnection(new AbortController().signal)).toBe(false);
});
