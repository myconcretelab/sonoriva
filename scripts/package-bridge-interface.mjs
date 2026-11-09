import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'dist/desktop');
const output = resolve(root, process.argv.includes('--embed') ? 'bridge/ui/console/package.json' : 'dist/interface/package.json');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const paths = (await readdir(source, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => resolve(entry.parentPath, entry.name).slice(source.length + 1).replaceAll('\\', '/')).filter((path) => path !== 'sw.js').sort();
const files = await Promise.all(paths.map(async (path) => ({ path, mime: mimeTypes[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream', content: (await readFile(resolve(source, path))).toString('base64') })));
const payload = { format: 1, protocol: 1, minBridgeVersion: '1.1.0', revision, version: metadata.version, files };
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, JSON.stringify(payload));
if (process.argv.includes('--sign')) {
  // The signing key is supplied by the release runner environment, never read or logged here.
  const cli = resolve(root, 'bridge/node_modules/@tauri-apps/cli/tauri.js');
  try { execFileSync(process.execPath, [cli, 'signer', 'sign', output], { cwd: root, stdio: 'pipe', env: process.env }); }
  catch { throw new Error('La signature de l’interface a échoué.'); }
  const signature = (await readFile(`${output}.sig`, 'utf8')).trim();
  await writeFile(resolve(root, 'dist/interface/sonoriva-interface.json'), JSON.stringify({ payload: (await readFile(output)).toString('base64'), signature }));
}
process.stdout.write(`Interface ${revision.slice(0, 12)} : ${files.length} fichiers préparés.\n`);
