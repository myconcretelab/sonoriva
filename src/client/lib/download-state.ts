export type DownloadTarget = 'browser' | 'bridge';
export type DownloadProgress = { received: number; total: number };
const progress = { browser: new Map<string, DownloadProgress>(), bridge: new Map<string, DownloadProgress>() };
const listeners = new Set<() => void>();
export function setDownloadProgress(target: DownloadTarget, id: string, value?: DownloadProgress): void {
  if (value) progress[target].set(id, value);
  else progress[target].delete(id);
  listeners.forEach((listener) => listener());
}
export function getDownloadProgress(target: DownloadTarget): Map<string, DownloadProgress> { return new Map(progress[target]); }
export function subscribeDownloads(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
