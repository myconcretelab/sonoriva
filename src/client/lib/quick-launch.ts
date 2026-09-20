import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isVideoTrack } from './video-engine';
import type { Track } from '../types';

export interface QuickLaunchState {
  enabled: boolean;
  size: 'mini' | 'medium' | 'large';
  removeAfterLaunch: boolean;
  replace: boolean;
  trackIds: string[];
}
export const defaultQuickLaunchState: QuickLaunchState = { enabled: false, size: 'medium', removeAfterLaunch: false, replace: true, trackIds: [] };
export function readQuickLaunch(serialized: string | null): QuickLaunchState {
  try {
    const value = JSON.parse(serialized ?? 'null');
    if (!value || typeof value !== 'object') return { ...defaultQuickLaunchState };
    return {
      enabled: value.enabled === true,
      size: ['mini', 'medium', 'large'].includes(value.size) ? value.size : 'medium',
      removeAfterLaunch: value.removeAfterLaunch === true,
      replace: typeof value.replace === 'boolean' ? value.replace : defaultQuickLaunchState.replace,
      trackIds: Array.isArray(value.trackIds) ? [...new Set(value.trackIds.filter((id: unknown): id is string => typeof id === 'string'))] as string[] : [],
    };
  } catch { return { ...defaultQuickLaunchState }; }
}

export function useQuickLaunch(scope: string, tracks: Track[], play: (tracks: Track[], replace: boolean) => Promise<string[]>, prepare?: (tracks: Track[]) => Promise<void>) {
  const key = `sonoriva-quick-launch:${scope}`;
  const initial = useMemo(() => readQuickLaunch(localStorage.getItem(key)), [key]);
  const [stored, setStored] = useState({ key, value: initial });
  const state = stored.key === key ? stored.value : initial;
  const busy = useRef(false);
  const activeKey = useRef(key);
  useEffect(() => { activeKey.current = key; }, [key]);
  const update = useCallback((patch: Partial<QuickLaunchState> | ((current: QuickLaunchState) => QuickLaunchState)) => {
    setStored((previous) => {
      const current = previous.key === key ? previous.value : initial;
      return { key, value: typeof patch === 'function' ? patch(current) : { ...current, ...patch } };
    });
  }, [initial, key]);
  useEffect(() => { if (stored.key === key) localStorage.setItem(key, JSON.stringify(stored.value)); }, [key, stored]);
  const queuedTracks = state.trackIds.flatMap((id) => { const track = tracks.find((item) => item.id === id); return track ? [track] : []; });
  const add = useCallback(async (ids: string[]) => {
    const added = [...new Set(ids)].flatMap((id) => {
      const track = tracks.find((item) => item.id === id && !isVideoTrack(item));
      return track ? [track] : [];
    });
    if (!added.length) return;
    update((current) => ({ ...current, trackIds: [...new Set([...current.trackIds, ...added.map((track) => track.id)])] }));
    await prepare?.(added);
  }, [prepare, tracks, update]);
  const launch = useCallback(async (trackId?: string) => {
    if (!state.enabled || busy.current) return;
    const selected = state.trackIds.flatMap((id) => { const track = tracks.find((item) => item.id === id); return track && (!trackId || track.id === trackId) ? [track] : []; });
    if (!selected.length) return;
    busy.current = true;
    try {
      const started = await play(selected, state.replace);
      if (state.removeAfterLaunch && activeKey.current === key) update((current) => ({ ...current, trackIds: current.trackIds.filter((id) => !started.includes(id)) }));
    } finally { busy.current = false; }
  }, [key, play, state, tracks, update]);
  return { state, update, tracks: queuedTracks, launch, add };
}
