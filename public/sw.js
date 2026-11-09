const AUDIO_CACHE = 'sonoriva-audio-v1';
const BUILD_REVISION = '__SONORIVA_BUILD_REVISION__';
const SHELL_CACHE = `sonoriva-shell-${BUILD_REVISION}`;
const PRECACHE_URLS = '__SONORIVA_PRECACHE_URLS__';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(
    PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })),
  )));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(keys.filter((key) => (
      key.startsWith('sonoriva-shell-') && key !== SHELL_CACHE
    )).map((key) => caches.delete(key)))),
  ]));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'APP_SHELL_STATUS' && event.ports[0]) {
    event.waitUntil(caches.open(SHELL_CACHE).then(async (cache) => {
      const complete = await Promise.all(PRECACHE_URLS.map((url) => cache.match(url, { ignoreVary: true })));
      event.ports[0].postMessage({ ready: complete.every(Boolean), revision: BUILD_REVISION });
    }));
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/^\/api\/tracks\/[^/]+\/stream$/.test(url.pathname)) {
    event.respondWith(caches.open(AUDIO_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreVary: true });
      if (!cached) return fetch(event.request);
      const range = event.request.headers.get('Range');
      if (!range) return cached;
      const blob = await cached.blob();
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = 0;
      let end = blob.size - 1;
      if (match && (match[1] || match[2])) {
        if (!match[1]) start = Math.max(0, blob.size - Number(match[2]));
        else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      } else return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= blob.size) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
      }
      const headers = new Headers(cached.headers);
      headers.set('Content-Range', `bytes ${start}-${end}/${blob.size}`);
      headers.set('Content-Length', String(end - start + 1));
      headers.set('Accept-Ranges', 'bytes');
      return new Response(blob.slice(start, end + 1), { status: 206, headers });
    }));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(SHELL_CACHE).then(async (cache) => {
      const path = url.pathname === '/projection.html' ? '/projection.html' : '/';
      if (['/', '/demo', '/projection.html'].includes(url.pathname)) {
        const cached = await cache.match(path, { ignoreVary: true });
        if (cached) return cached;
      }
      return fetch(event.request).catch(async () => await cache.match(path, { ignoreVary: true }) ?? Response.error());
    }));
    return;
  }
  if (['style', 'script', 'font', 'image'].includes(event.request.destination)) {
    event.respondWith(caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreVary: true });
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }));
  }
});
