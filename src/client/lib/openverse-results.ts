import type { OpenverseSearchResult, OpenverseSound, OpenverseSource } from '../types';

export function filterOpenverseResults(results: OpenverseSound[], sources: Set<OpenverseSource>, minDuration?: number, maxDuration?: number): OpenverseSound[] {
  return results.filter((sound) => sources.has(sound.source)
    && (minDuration === undefined || sound.durationSeconds >= minDuration)
    && (maxDuration === undefined || sound.durationSeconds <= maxDuration));
}

export function mergeOpenverseResults(current: OpenverseSearchResult, incoming: OpenverseSearchResult): OpenverseSearchResult {
  const existing = new Set(current.results.map((sound) => `${sound.source}:${sound.id}`));
  const additions = incoming.results.filter((sound) => !existing.has(`${sound.source}:${sound.id}`));
  return {
    ...current,
    count: current.count + incoming.count,
    hasNext: current.hasNext || incoming.hasNext,
    results: [...current.results, ...additions],
  };
}
