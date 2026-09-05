import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bridgePackage = JSON.parse(readFileSync(new URL('../bridge/package.json', import.meta.url), 'utf8')) as { version: string };
const tauriConfig = JSON.parse(readFileSync(new URL('../bridge/src-tauri/tauri.conf.json', import.meta.url), 'utf8')) as {
  version: string;
  bundle: { macOS: { minimumSystemVersion: string } };
};
const cargoManifest = readFileSync(new URL('../bridge/src-tauri/Cargo.toml', import.meta.url), 'utf8');
const bridgeUi = readFileSync(new URL('../bridge/ui/index.html', import.meta.url), 'utf8');
const bridgeStyles = readFileSync(new URL('../bridge/ui/style.css', import.meta.url), 'utf8');
const bridgeScript = readFileSync(new URL('../bridge/ui/app.js', import.meta.url), 'utf8');
const bridgeLogo = readFileSync(new URL('../bridge/ui/sonoriva-logo.svg', import.meta.url), 'utf8');
const applicationLogo = readFileSync(new URL('../public/sonoriva-logo.svg', import.meta.url), 'utf8');

describe('distribution du Bridge', () => {
  it('garde la même version dans tous les manifestes et dans l’interface', () => {
    expect(tauriConfig.version).toBe(bridgePackage.version);
    expect(cargoManifest).toContain(`version = "${bridgePackage.version}"`);
    expect(bridgeUi).toContain(`id="bridge-version">${bridgePackage.version}<`);
  });

  it('produit les paquets macOS pour Big Sur et les versions ultérieures', () => {
    expect(tauriConfig.bundle.macOS.minimumSystemVersion).toBe('11.0');
  });

  it('utilise la nouvelle identité SonoRiva et anime le logo au chargement', () => {
    expect(bridgeLogo).toBe(applicationLogo);
    expect(bridgeUi).toContain('class="brand-mark"');
    expect(bridgeStyles).toContain('--accent: #DBEDF7;');
    expect(bridgeStyles).toContain('--accent-ink: #384661;');
    expect(bridgeStyles).toContain('@keyframes brand-enter');
    expect(bridgeStyles).toContain('@keyframes brand-ring');
    expect(bridgeStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(bridgeScript).toContain("document.body.classList.add('is-loaded')");
  });
});
