// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Track } from '../src/client/types';
const mocks = vi.hoisted(() => ({ enabled: vi.fn(() => true), outputs: vi.fn(), server: vi.fn() }));
vi.mock('../src/client/lib/bridge-client', () => ({ bridgeClient: {
  isEnabled: mocks.enabled, outputs: mocks.outputs,
  subscribeRouting: (listener: () => void) => { listener(); return () => {}; },
} }));
vi.mock('../src/client/lib/connectivity', () => ({ checkServerConnection: mocks.server }));
import { OfflineStatusControl } from '../src/client/components/OfflineStatusControl';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it('contrôle indépendamment le Bridge et Internet, signale une panne et le retour du serveur', async () => {
  vi.useFakeTimers();
  mocks.server.mockResolvedValue(false);
  mocks.outputs.mockResolvedValue({ outputs: [{ id: 'default' }] });
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(OfflineStatusControl, { tracks: [{ id: 'sound' }] as Track[], cachedIds: new Set(['sound']), onPrepare: vi.fn() })));
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('Hors ligne');
    expect(button.classList.contains('is-incomplete')).toBe(false);
    act(() => button.click());
    expect(container.textContent).toContain('Bridge local : joignable');
    expect(container.textContent).toContain('1/1 fichiers');
    mocks.outputs.mockRejectedValue(new Error('Bridge arrêté'));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(button.classList.contains('is-incomplete')).toBe(true);
    expect(container.textContent).toContain('Bridge local : injoignable');
    mocks.server.mockResolvedValue(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(button.textContent).toBe('En ligne');
    expect(mocks.server).toHaveBeenCalledTimes(3);
  } finally { act(() => root.unmount()); }
  await vi.advanceTimersByTimeAsync(10_000);
  expect(mocks.server).toHaveBeenCalledTimes(3);
});

it('propose les morceaux manquants, affiche la progression puis la disponibilité complète', async () => {
  mocks.server.mockResolvedValue(true);
  mocks.outputs.mockResolvedValue({ outputs: [{ id: 'default' }] });
  const container = document.createElement('div');
  const root = createRoot(container);
  const onPrepare = vi.fn();
  const tracks = [{ id: 'one' }, { id: 'two' }, { id: 'three' }] as Track[];
  const props = { tracks, cachedIds: new Set(['one']), onPrepare };
  try {
    await act(async () => root.render(createElement(OfflineStatusControl, props)));
    act(() => container.querySelector('button')!.click());
    let action = container.querySelector<HTMLButtonElement>('.offline-prepare-button')!;
    expect(action.textContent).toContain('Télécharger les 2 morceaux manquants');
    act(() => action.click());
    expect(onPrepare).toHaveBeenCalledOnce();
    await act(async () => root.render(createElement(OfflineStatusControl, { ...props, busy: true, preparation: { done: 2, total: 3, running: true } })));
    action = container.querySelector<HTMLButtonElement>('.offline-prepare-button')!;
    expect(action.disabled).toBe(true);
    expect(container.querySelector('progress')!.value).toBe(2);
    await act(async () => root.render(createElement(OfflineStatusControl, { ...props, preparation: { done: 2, total: 3, running: false, error: 'Connexion interrompue' } })));
    expect(container.querySelector('[role=alert]')!.textContent).toBe('Connexion interrompue');
    expect(container.querySelector<HTMLButtonElement>('.offline-prepare-button')!.disabled).toBe(false);
    await act(async () => root.render(createElement(OfflineStatusControl, { ...props, cachedIds: new Set(tracks.map(t => t.id)) })));
    expect(container.querySelector('.offline-prepare-button')).toBeNull();
    expect(container.querySelector('.offline-status-button [aria-label="Spectacle disponible hors ligne"]')).not.toBeNull();
    expect(container.querySelector('[role=status]')!.textContent).toBe('Spectacle disponible hors ligne');
  } finally { act(() => root.unmount()); }
});
