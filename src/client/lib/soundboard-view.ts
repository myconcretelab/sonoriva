export type SoundboardViewMode = 'cards' | 'list' | 'auto';
export type SoundboardView = 'cards' | 'list';

export interface SoundboardViewSettings {
  mode: SoundboardViewMode;
  greyPlayed: boolean;
  categoryGreyPlayed: Record<string, boolean>;
  categoryModes: Record<string, SoundboardViewMode>;
  automaticListThreshold: number;
  desktopListColumns: number;
  mobileListColumns: number;
}

export const defaultSoundboardViewSettings: SoundboardViewSettings = {
  mode: 'cards',
  greyPlayed: false,
  categoryGreyPlayed: {},
  categoryModes: {},
  automaticListThreshold: 30,
  desktopListColumns: 2,
  mobileListColumns: 1,
};

export function resolveSoundboardView(mode: SoundboardViewMode, trackCount: number, threshold: number): SoundboardView {
  if (mode === 'auto') return trackCount >= threshold ? 'list' : 'cards';
  return mode;
}

export function soundboardViewModeForCategory(settings: SoundboardViewSettings, categoryId?: string): SoundboardViewMode {
  return categoryId ? settings.categoryModes[categoryId] ?? settings.mode : settings.mode;
}

export function applySoundboardViewMode(settings: SoundboardViewSettings, mode: SoundboardViewMode, categoryId?: string): SoundboardViewSettings {
  return categoryId
    ? { ...settings, categoryModes: { ...settings.categoryModes, [categoryId]: mode } }
    : { ...settings, mode, categoryModes: {} };
}

export function readSoundboardViewSettings(serialized: string | null): SoundboardViewSettings {
  if (!serialized) return { ...defaultSoundboardViewSettings };
  try {
    const value = JSON.parse(serialized) as Partial<SoundboardViewSettings>;
    return {
      mode: value.mode === 'list' || value.mode === 'auto' || value.mode === 'cards' ? value.mode : defaultSoundboardViewSettings.mode,
      categoryModes: readCategoryModes(value.categoryModes),
      greyPlayed: value.greyPlayed === true,
      categoryGreyPlayed: value.categoryGreyPlayed && typeof value.categoryGreyPlayed === 'object' && !Array.isArray(value.categoryGreyPlayed)
        ? Object.fromEntries(Object.entries(value.categoryGreyPlayed).filter(([, enabled]) => typeof enabled === 'boolean')) : {},
      automaticListThreshold: clamp(value.automaticListThreshold, 5, 200, defaultSoundboardViewSettings.automaticListThreshold),
      desktopListColumns: clamp(value.desktopListColumns, 1, 8, defaultSoundboardViewSettings.desktopListColumns),
      mobileListColumns: clamp(value.mobileListColumns, 1, 2, defaultSoundboardViewSettings.mobileListColumns),
    };
  } catch {
    return { ...defaultSoundboardViewSettings };
  }
}

function readCategoryModes(value: unknown): Record<string, SoundboardViewMode> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, SoundboardViewMode] => entry[1] === 'cards' || entry[1] === 'list' || entry[1] === 'auto'));
}

export function soundboardViewStorageKey(projectId: string): string {
  return `sonoriva-soundboard-view:${projectId}`;
}

function clamp(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value))) : fallback;
}

export function greyPlayedForCategory(settings: SoundboardViewSettings, categoryId?: string): boolean {
  return categoryId ? settings.categoryGreyPlayed[categoryId] ?? settings.greyPlayed : settings.greyPlayed;
}

export function applyGreyPlayed(settings: SoundboardViewSettings, enabled: boolean, categoryId?: string): SoundboardViewSettings {
  return categoryId
    ? { ...settings, categoryGreyPlayed: { ...settings.categoryGreyPlayed, [categoryId]: enabled } }
    : { ...settings, greyPlayed: enabled, categoryGreyPlayed: {} };
}
