import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

async function requestCached(range?: string) {
  const callbacks: Record<string, (event: any) => void> = {};
  const network = vi.fn();
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: { addEventListener: (name: string, callback: (event: any) => void) => { callbacks[name] = callback; }, location: { origin: 'https://example.test' } },
    caches: { open: async () => ({ match: async () => new Response('0123456789', { headers: { 'Content-Type': 'video/mp4' } }) }) },
    URL, Response, Headers, fetch: network,
  });
  let response!: Promise<Response>;
  callbacks.fetch!({ request: new Request('https://example.test/api/tracks/video/stream', { headers: range ? { Range: range } : {} }), respondWith: (value: Promise<Response>) => { response = value; } });
  const result = await response;
  expect(network).not.toHaveBeenCalled();
  return result;
}
describe('vidéo hors ligne et requêtes Range', () => {
  it.each([['bytes=2-5', '2345', 'bytes 2-5/10'], ['bytes=7-', '789', 'bytes 7-9/10'], ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=7-99', '789', 'bytes 7-9/10']])('sert %s depuis le cache', async (range, body, contentRange) => {
    const response = await requestCached(range);
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe(contentRange);
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
    expect(await response.text()).toBe(body);
  });
  it.each(['bytes=10-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5', 'invalid'])('refuse une plage invalide %s', async (range) => {
    const response = await requestCached(range);
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */10');
  });
  it('conserve le téléchargement complet pour les clients audio', async () => {
    const response = await requestCached(); expect(response.status).toBe(200); expect(await response.text()).toBe('0123456789');
  });
});
