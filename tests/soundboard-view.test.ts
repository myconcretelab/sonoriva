import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applySoundboardViewMode, defaultSoundboardViewSettings, readSoundboardViewSettings, resolveSoundboardView, soundboardViewModeForCategory, soundboardViewStorageKey } from '../src/client/lib/soundboard-view';

describe('soundboard view', () => {
  it('resolves the automatic list view from the configured track threshold', () => {
    expect(resolveSoundboardView('auto', 29, 30)).toBe('cards');
    expect(resolveSoundboardView('auto', 30, 30)).toBe('list');
    expect(resolveSoundboardView('cards', 100, 30)).toBe('cards');
    expect(resolveSoundboardView('list', 1, 30)).toBe('list');
  });

  it('restores and clamps persisted display settings', () => {
    expect(readSoundboardViewSettings(JSON.stringify({ mode: 'auto', categoryModes: { category: 'list', invalid: 'tiles' }, automaticListThreshold: 500, desktopListColumns: 3, mobileListColumns: 8 }))).toEqual({
      mode: 'auto', categoryModes: { category: 'list' }, automaticListThreshold: 200, desktopListColumns: 3, mobileListColumns: 2,
    });
    expect(readSoundboardViewSettings('{')).toEqual(defaultSoundboardViewSettings);
  });

  it('restores eight list columns and clamps larger values', () => {
    expect(readSoundboardViewSettings(JSON.stringify({ desktopListColumns: 8 })).desktopListColumns).toBe(8);
    expect(readSoundboardViewSettings(JSON.stringify({ desktopListColumns: 12 })).desktopListColumns).toBe(8);
  });

  it('uses a category display mode before the project-wide mode', () => {
    const settings = { ...defaultSoundboardViewSettings, mode: 'cards' as const, categoryModes: { category: 'list' as const } };
    expect(soundboardViewModeForCategory(settings, 'category')).toBe('list');
    expect(soundboardViewModeForCategory(settings, 'other')).toBe('cards');
    expect(soundboardViewModeForCategory(settings)).toBe('cards');
  });

  it('applies a mode to one category or to the whole project', () => {
    const category = applySoundboardViewMode(defaultSoundboardViewSettings, 'list', 'category');
    expect(category).toMatchObject({ mode: 'cards', categoryModes: { category: 'list' } });
    expect(applySoundboardViewMode(category, 'auto')).toMatchObject({ mode: 'auto', categoryModes: {} });
  });

  it('uses a distinct persistence key for each project', () => {
    expect(soundboardViewStorageKey('project-a')).not.toBe(soundboardViewStorageKey('project-b'));
  });

  it('renders configurable multi-column list items with their track metadata', () => {
    const app = readFileSync(new URL('../src/client/App.tsx', import.meta.url), 'utf8');
    const trackPad = readFileSync(new URL('../src/client/components/TrackPad.tsx', import.meta.url), 'utf8');
    const styles = readFileSync(new URL('../src/client/styles.css', import.meta.url), 'utf8');

    expect(app).toContain('soundboardViewModeForCategory(soundboardViewSettings');
    expect(app).toContain("soundboardView === 'list' ? 'is-list' : ''");
    expect(app).toContain('Colonnes de liste');
    expect(app).toContain('Cette catégorie');
    expect(app).toContain('applySoundboardViewToAll');
    expect(trackPad).toContain('track-list-shortcut');
    expect(styles).toContain('.track-grid.is-list');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) auto 96px;');
    expect(styles).toContain('min-height: 46px;');
  });
});
