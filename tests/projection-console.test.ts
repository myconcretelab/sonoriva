// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectionConsole } from '../src/client/components/ProjectionConsole';
import { videoEngine } from '../src/client/lib/video-engine';

vi.mock('../src/client/lib/video-engine', () => ({ videoEngine: {
  getState: vi.fn(() => ({ connected: false, error: '', black: false })),
  subscribe: vi.fn(() => () => undefined), getElement: vi.fn(), open: vi.fn(), whenReady: vi.fn(),
  togglePause: vi.fn(), stop: vi.fn(), toggleBlack: vi.fn(), close: vi.fn(),
} }));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('commandes vidéo à la demande', () => {
  it('ne réserve aucune barre lorsque la projection est fermée', async () => {
    await act(async () => root.render(createElement(ProjectionConsole)));
    expect(container.childElementCount).toBe(0);
  });
  it('replie le panneau sans fermer la sortie vidéo', async () => {
    const onClose = vi.fn();
    await act(async () => root.render(createElement(ProjectionConsole, { panel: true, onClose })));
    await act(async () => (container.querySelector('[aria-label="Replier les commandes vidéo"]') as HTMLButtonElement).click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(videoEngine.close).not.toHaveBeenCalled();
  });
  it('lance la vidéo seulement une fois la projection prête', async () => {
    let ready!: () => void;
    vi.mocked(videoEngine.whenReady).mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    const run = vi.fn(async () => undefined);
    await act(async () => root.render(createElement(ProjectionConsole, { panel: true, pending: { title: 'Vidéo test', run } })));
    await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Ouvrir la projection et lire')!.click());
    expect(videoEngine.open).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    await act(async () => ready());
    expect(run).toHaveBeenCalledOnce();
  });
  it('annule le lancement en attente lorsque le panneau est retiré', async () => {
    let ready!: () => void;
    vi.mocked(videoEngine.whenReady).mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    const run = vi.fn(async () => undefined);
    await act(async () => root.render(createElement(ProjectionConsole, { panel: true, pending: { title: 'Vidéo test', run } })));
    await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Ouvrir la projection et lire')!.click());
    await act(async () => root.render(null));
    await act(async () => ready());
    expect(run).not.toHaveBeenCalled();
  });
});
