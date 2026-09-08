import { describe, expect, it } from 'vitest';
import { appSkins, appSkinStorageKey, applyAppSkin, normalizeAppSkin, readAppSkin, saveAppSkin } from '../src/client/lib/app-skin.js';

describe('skins de l’application', () => {
  it('utilise le skin original pour une valeur absente ou inconnue', () => {
    expect(normalizeAppSkin(null)).toBe('original');
    expect(normalizeAppSkin('inconnu')).toBe('original');
  });

  it.each(appSkins)('lit, enregistre et applique le skin %s', (skin) => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(readAppSkin(storage)).toBe('original');
    saveAppSkin(skin, storage);
    expect(readAppSkin(storage)).toBe(skin);
    const root = { dataset: {} } as unknown as HTMLElement;
    applyAppSkin(readAppSkin(storage), root);
    expect(root.dataset.skin).toBe(skin);
    saveAppSkin('original', storage);
    expect(values.get(appSkinStorageKey)).toBe('original');
  });

  it('applique le skin comme attribut de document', () => {
    const root = { dataset: {} } as unknown as HTMLElement;
    applyAppSkin('studio', root);
    expect(root.dataset.skin).toBe('studio');
  });
});
