import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker(missing?: string) {
  const callbacks: Record<string, (event: any) => void> = {};
  const urls = ['/', '/assets/app.js', '/assets/app.css'];
  const cache = { addAll: vi.fn(async () => undefined), match: vi.fn(async (url: string) => url === missing ? undefined : new Response(url)) };
  const fetcher = vi.fn(async () => { throw new TypeError('Offline'); });
  const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8').replace("'__SONORIVA_PRECACHE_URLS__'", JSON.stringify(urls));
  runInNewContext(source, {
    self: { addEventListener: (name: string, callback: (event: any) => void) => { callbacks[name] = callback; }, location: { origin: 'https://example.test' } },
    caches: { open: async () => cache }, URL, Response, Headers, Request: class extends Request { constructor(url: string, init?: RequestInit) { super(new URL(url, 'https://example.test'), init); } }, fetch: fetcher,
  });
  return { callbacks, cache, fetcher, urls };
}

describe('ouverture de l’application sans réseau', () => {
  it('précharge le code et les styles dès l’installation avec une lecture réseau fraîche', async () => {
    const { callbacks, cache, urls } = worker();
    let complete!: Promise<void>;
    callbacks.install({ waitUntil: (promise: Promise<void>) => { complete = promise; } });
    await complete;
    const requests = cache.addAll.mock.calls[0][0] as Request[];
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual(urls);
    expect(requests.every((request) => request.cache === 'reload')).toBe(true);
  });
  it.each([undefined, '/assets/app.js', '/assets/app.css'])('ne déclare le démarrage disponible que si tous les fichiers sont présents (%s)', async (missing) => {
    const { callbacks } = worker(missing);
    const answer = vi.fn();
    let complete!: Promise<void>;
    callbacks.message({ data: { type: 'APP_SHELL_STATUS' }, ports: [{ postMessage: answer }], waitUntil: (promise: Promise<void>) => { complete = promise; } });
    await complete;
    expect(answer).toHaveBeenCalledWith(expect.objectContaining({ ready: missing === undefined }));
  });
  it('rouvre la page locale sans attendre ni contacter le serveur', async () => {
    const { callbacks, fetcher } = worker();
    let response!: Promise<Response>;
    callbacks.fetch({ request: { url: 'https://example.test/', method: 'GET', mode: 'navigate' }, respondWith: (promise: Promise<Response>) => { response = promise; } });
    expect(await (await response).text()).toBe('/');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sert les modules préchargés malgré le header Origin différent de leur première requête', async () => {
    const { callbacks, cache, fetcher } = worker();
    cache.match.mockImplementation(async (_url: string, options?: CacheQueryOptions) => options?.ignoreVary ? new Response('module') : undefined);
    let response!: Promise<Response>;
    callbacks.fetch({ request: { url: 'https://example.test/assets/app.js', method: 'GET', destination: 'script' }, respondWith: (promise: Promise<Response>) => { response = promise; } });
    expect(await (await response).text()).toBe('module');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
