// Shared by the browser and server. This module must remain independent of Node APIs.
export const categoryKeys = ['name', 'color', 'position', 'backgroundImage'] as const;
export const playlistKeys = ['name', 'color', 'position', 'categoryId', 'autostart', 'loop', 'random', 'showNextButton', 'gapMs', 'crossfadeMs', 'soundboardBehavior', 'items'] as const;
export function entityValue(key: string, value: unknown): unknown {
  return value ?? (key === 'soundboardBehavior' ? 'continue' : key === 'backgroundImage' || key === 'categoryId' ? null : value);
}
export function equalValue(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
export function entityChanges<T extends object>(base: T, desired: T, keys: readonly string[]): Partial<T> {
  const before = base as Record<string, unknown>, after = desired as Record<string, unknown>;
  return Object.fromEntries(keys.filter((key) => !equalValue(entityValue(key, before[key]), entityValue(key, after[key]))).map((key) => [key, entityValue(key, after[key])])) as Partial<T>;
}
export function mergeEntity<T extends object>(base: T | null, desired: T | null, remote: T | null, keys: readonly string[]): { entity: T | null; conflict: boolean } {
  if (!desired) return { entity: null, conflict: Boolean(remote && (!base || Object.keys(entityChanges(base, remote, keys)).length)) };
  if (!base) return { entity: remote ?? desired, conflict: Boolean(remote && Object.keys(entityChanges(desired, remote, keys)).length) };
  if (!remote) return { entity: null, conflict: true };
  const changes = entityChanges(base, desired, keys);
  const conflict = Object.keys(changes).some((key) => {
    const value = entityValue(key, (remote as Record<string, unknown>)[key]);
    return !equalValue(value, entityValue(key, (base as Record<string, unknown>)[key])) && !equalValue(value, (changes as Record<string, unknown>)[key]);
  });
  return { entity: { ...remote, ...changes }, conflict };
}
