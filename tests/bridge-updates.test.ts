import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync(new URL('../bridge/ui/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../bridge/ui/app.js', import.meta.url), 'utf8');
let dom: JSDOM;
afterEach(() => dom?.window.close());

async function setup(status = { phase: 'current', message: 'À jour' }) {
  dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  const invoke = vi.fn().mockResolvedValue(status);
  Object.assign(dom.window, {
    __TAURI__: { core: { invoke } },
    fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '1.0.8', paired: false, cachedTracks: 0 }) }),
  });
  dom.window.eval(script);
  await flush();
  return { invoke, document: dom.window.document };
}
async function flush() { await new Promise((resolve) => setTimeout(resolve, 0)); }

describe('Bridge manual updates', () => {
  it('checks without installing, then installs only on the second button', async () => {
    const { invoke, document } = await setup();
    invoke.mockResolvedValue({ phase: 'available', message: 'Version disponible', version: '1.0.9' });
    (document.querySelector('#check-update') as HTMLButtonElement).click();
    await flush();
    expect(invoke).toHaveBeenCalledWith('check_bridge_update', { install: false });
    const install = document.querySelector('#install-update') as HTMLButtonElement;
    expect(install.hidden).toBe(false);
    expect(install.textContent).toContain('1.0.9');
    invoke.mockResolvedValue({ phase: 'deferred', message: 'Lecture active', version: '1.0.9' });
    install.click();
    await flush();
    expect(invoke).toHaveBeenCalledWith('check_bridge_update', { install: true });
    expect(document.querySelector('#update-status')?.textContent).toBe('Lecture active');
    expect(install.hidden).toBe(false);
  });

  it('disables duplicate requests and exposes errors with a retry button', async () => {
    const { invoke, document } = await setup();
    let reject!: (cause: string) => void;
    invoke.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    const check = document.querySelector('#check-update') as HTMLButtonElement;
    check.click();
    expect(check.disabled).toBe(true);
    check.click();
    expect(invoke.mock.calls.filter(([command]) => command === 'check_bridge_update')).toHaveLength(1);
    reject('Connexion GitHub impossible');
    await flush();
    expect(check.disabled).toBe(false);
    expect(document.querySelector('#update-status')?.textContent).toContain('Connexion GitHub impossible');
    expect((document.querySelector('#install-update') as HTMLButtonElement).hidden).toBe(true);
  });

  it('shows a current installation without proposing another install', async () => {
    const { document } = await setup();
    expect(document.querySelector('#update-status')?.textContent).toBe('À jour');
    expect((document.querySelector('#install-update') as HTMLButtonElement).hidden).toBe(true);
  });

  it('links downloads to the release list', () => {
    const routes = readFileSync(new URL('../src/server/routes/bridge.ts', import.meta.url), 'utf8');
    expect(routes).toContain("const bridgeDownloadUrl = 'https://github.com/myconcretelab/sonoriva/releases/';");
  });
});
