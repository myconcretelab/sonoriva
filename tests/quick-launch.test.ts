// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickLaunchPanel } from '../src/client/components/QuickLaunchPanel';
import { defaultQuickLaunchState, readQuickLaunch, useQuickLaunch } from '../src/client/lib/quick-launch';
import { createWorkspaceLayout, readWorkspaceLayout, swapWorkspaceItems } from '../src/client/lib/workspace-layout';
import type { Track } from '../src/client/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); vi.unstubAllGlobals(); });
const tracks = [{ id: 'a', title: 'Pluie' }, { id: 'b', title: 'Vent' }] as Track[];
function setup(play = vi.fn(async (items: Track[]) => items.map((track) => track.id))) {
  let current: ReturnType<typeof useQuickLaunch>;
  function Harness({ scope }: { scope: string }) {
    current = useQuickLaunch(scope, tracks, play);
    return null;
  }
  const element = document.createElement('div');
  const root = createRoot(element);
  const render = (scope: string) => act(() => root.render(createElement(Harness, { scope })));
  render('first');
  cleanups.push(() => act(() => root.unmount()));
  return { get current() { return current!; }, play, render };
}

describe('départ rapide', () => {
  it('restaure uniquement des préférences valides et déduplique les sons', () => {
    expect(readQuickLaunch('{')).toEqual(defaultQuickLaunchState);
    expect(readQuickLaunch(JSON.stringify({ enabled: true, size: 'bad', trackIds: ['a', 1, 'a', 'b'] }))).toMatchObject({ enabled: true, size: 'medium', trackIds: ['a', 'b'] });
  });
  it('lance la zone ensemble, conserve les sons par défaut et transmet le remplacement', async () => {
    const view = setup();
    act(() => view.current.update({ enabled: true, replace: true, trackIds: ['a', 'b', 'deleted'] }));
    await act(() => view.current.launch());
    expect(view.play).toHaveBeenCalledWith(tracks, true);
    expect(view.current.tracks).toEqual(tracks);
    expect(view.current.state.trackIds).toContain('a');
  });
  it('retire seulement les lancements réussis et permet le départ individuel', async () => {
    const view = setup(vi.fn(async () => ['a']));
    act(() => view.current.update({ enabled: true, removeAfterLaunch: true, trackIds: ['a', 'b'] }));
    await act(() => view.current.launch('a'));
    expect(view.play).toHaveBeenCalledWith([tracks[0]], false);
    expect(view.current.state.trackIds).toEqual(['b']);
  });
  it('ignore une zone masquée ou vide et isole les spectacles', async () => {
    const view = setup();
    act(() => view.current.update({ trackIds: ['a'] }));
    await act(() => view.current.launch());
    expect(view.play).not.toHaveBeenCalled();
    view.render('second');
    expect(view.current.state.trackIds).toEqual([]);
    act(() => view.current.update({ enabled: true }));
    await act(() => view.current.launch());
    expect(view.play).not.toHaveBeenCalled();
    view.render('first');
    expect(view.current.state.trackIds).toEqual(['a']);
  });
  it('empêche les doubles lancements pendant le chargement', async () => {
    let finish!: (ids: string[]) => void;
    const view = setup(vi.fn(() => new Promise<string[]>((resolve) => { finish = resolve; })));
    act(() => view.current.update({ enabled: true, trackIds: ['a'] }));
    let pending!: Promise<void>;
    act(() => { pending = view.current.launch(); });
    await act(() => view.current.launch());
    expect(view.play).toHaveBeenCalledTimes(1);
    await act(async () => { finish(['a']); await pending; });
  });
  it('ajoute le module aux anciennes dispositions personnalisées sans les réinitialiser', () => {
    const layout = createWorkspaceLayout();
    const legacy = { ...layout, preset: 'custom', items: layout.items.filter((item) => item.id !== 'quickLaunch'), dock: layout.dock.filter((id) => id !== 'quickLaunch') };
    const restored = readWorkspaceLayout(JSON.stringify(legacy));
    expect(restored.items.filter((item) => item.id !== 'quickLaunch')).toEqual(legacy.items);
    expect(restored.quickLaunchAttached).toBe(true);
    const moved = swapWorkspaceItems(restored, 'quickLaunch', 'playlist');
    expect(moved.quickLaunchAttached).toBe(false);
    expect(readWorkspaceLayout(JSON.stringify(moved))).toEqual(moved);
  });
  it('reçoit un glisser-déposer, ouvre les options et vide la zone', () => {
    const element = document.createElement('div'); document.body.append(element);
    const root = createRoot(element);
    const onDropTracks = vi.fn(); const onUpdate = vi.fn(); const onLaunch = vi.fn();
    act(() => root.render(createElement(QuickLaunchPanel, { state: { ...defaultQuickLaunchState, enabled: true }, tracks, shortcut: 'Entrée', onDropTracks, onUpdate, onLaunch })));
    cleanups.push(() => { act(() => root.unmount()); element.remove(); });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['application/x-sonoriva-track'], getData: (type: string) => type === 'application/x-sonoriva-track' ? 'a' : '' } });
    act(() => element.querySelector('.quick-launch-panel')!.dispatchEvent(drop));
    expect(onDropTracks).toHaveBeenCalledWith(['a']);
    act(() => element.querySelector<HTMLButtonElement>('[aria-label="Lancer le départ rapide"]')!.click());
    expect(onLaunch).toHaveBeenCalledWith();
    act(() => element.querySelector<HTMLButtonElement>('[aria-label="Options du départ rapide"]')!.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Fermer"]')!.click());
    act(() => element.querySelector<HTMLButtonElement>('[aria-label="Vider le départ rapide"]')!.click());
    expect(onUpdate).toHaveBeenCalledWith({ trackIds: [] });
  });
});
