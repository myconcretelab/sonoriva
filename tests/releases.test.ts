import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADMIN_RELEASES, APP_RELEASES, compareVersions, CURRENT_VERSION, releasesAfter } from '../src/server/releases.js';

describe('app releases', () => {
  it('conserve la version applicative alignée avec package.json', () => {
    const packageMetadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(CURRENT_VERSION).toBe(packageMetadata.version);
    expect(APP_RELEASES[0]?.version).toBe(CURRENT_VERSION);
  });

  it('retourne uniquement les versions encore non consultées', () => {
    expect(releasesAfter(null)).toEqual(APP_RELEASES);
    expect(releasesAfter('0.1.0')).toEqual(APP_RELEASES);
    expect(releasesAfter('0.2.0')).toEqual(APP_RELEASES.filter((release) => compareVersions(release.version, '0.2.0') > 0));
    expect(releasesAfter(CURRENT_VERSION)).toEqual([]);
  });

  it('sépare les versions de la régie et de l’administration', () => {
    expect(APP_RELEASES.every((release) => release.audience === 'app')).toBe(true);
    expect(ADMIN_RELEASES.every((release) => release.audience === 'admin')).toBe(true);
    expect(APP_RELEASES.map((release) => release.version)).not.toContain('0.9.0');
    expect(ADMIN_RELEASES.map((release) => release.version)).toContain('0.9.0');
  });

  it('compare les versions sémantiques numériquement', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
  });
});
