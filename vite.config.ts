import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import packageMetadata from './package.json';

const serviceWorkerRevisionToken = '__SONORIVA_BUILD_REVISION__';
const precacheToken = "'__SONORIVA_PRECACHE_URLS__'";

function currentBuildRevision(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return packageMetadata.version;
  }
}

function versionServiceWorker(): Plugin {
  const revision = currentBuildRevision();
  return {
    name: 'sonoriva-version-service-worker',
    apply: 'build',
    async closeBundle() {
      const output = new URL('./dist/client/sw.js', import.meta.url);
      const source = await readFile(output, 'utf8');
      if (!source.includes(serviceWorkerRevisionToken)) {
        throw new Error('Le jeton de version du service worker est absent.');
      }
      const assets = await readdir(new URL('./dist/client/assets/', import.meta.url), { recursive: true });
      const urls = ['/', '/manifest.webmanifest', '/projection.html', '/icon.png', '/icon.svg', '/sonoriva-logo.svg', '/sonoriva-logo-animated.svg', '/textures/retro-wood.webp', ...assets.map((file) => `/assets/${file}`)];
      if (!source.includes(precacheToken)) throw new Error('Le manifeste hors ligne est absent.');
      await writeFile(output, source.replaceAll(serviceWorkerRevisionToken, revision).replace(precacheToken, JSON.stringify(urls)));
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: mode === 'desktop' ? './' : '/',
  plugins: [react(), ...(mode === 'desktop' ? [] : [versionServiceWorker()])],
  define: {
    __APP_VERSION__: JSON.stringify(packageMetadata.version),
  },
  root: 'src/client',
  publicDir: '../../public',
  build: {
    outDir: mode === 'desktop' ? '../../dist/desktop' : '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8100',
      '/socket.io': {
        target: 'ws://127.0.0.1:8100',
        ws: true,
      },
    },
  },
}));
