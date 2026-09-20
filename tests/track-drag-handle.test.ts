// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrackPad } from '../src/client/components/TrackPad';
import type { Track } from '../src/client/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
function setup(selectionMode = false, selected = false, dragEnabled = true) {
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const callbacks = { onPrimary: vi.fn(), onSecondary: vi.fn(), onEdit: vi.fn(), onOutputPlay: vi.fn(), onSelect: vi.fn(), onDragStart: vi.fn(), onDragOver: vi.fn(), onDrop: vi.fn(), onDragEnd: vi.fn(), onMobileDragStart: vi.fn() };
  act(() => root.render(createElement(TrackPad, {
    track: { id: 'track', title: 'Vent', durationMs: 30_000, startTimeMs: 0, volume: 1 } as Track,
    color: '#22d3b6', active: false, loaded: false, playbacks: [], historyProgress: 0, shortcut: '1', dragEnabled,
    selectionMode, selected, dropTarget: false, mobileDragEnabled: true,
    bridgeOutputs: [{ id: 'main', name: 'Principale', color: '#fff', isDefault: true }, { id: 'other', name: 'Secondaire', color: '#fff', isDefault: false }], mainBridgeOutputId: 'main', ...callbacks,
  })));
  cleanups.push(() => { act(() => root.unmount()); container.remove(); });
  return { container, callbacks, pad: container.querySelector<HTMLElement>('[data-track-id]')!, handle: container.querySelector<HTMLElement>('[data-track-drag-handle]')! };
}
function drag(target: HTMLElement) {
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  const setDragImage = vi.fn();
  Object.defineProperty(event, 'dataTransfer', { value: { setDragImage } });
  act(() => target.dispatchEvent(event));
  return { event, setDragImage };
}
function pointer(target: HTMLElement, type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 20 });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'touch' } });
  act(() => target.dispatchEvent(event));
}

describe('poignée permanente des morceaux', () => {
  it('déplace depuis la durée et le raccourci, sans rendre le bouton de lecture déplaçable', () => {
    const { pad, handle, callbacks, container } = setup();
    expect(pad.draggable).toBe(false);
    expect(handle.draggable).toBe(true);
    expect(handle.textContent).toContain('0:30');
    expect(handle.textContent).toContain('Touche 1');
    expect(drag(container.querySelector<HTMLElement>('.track-trigger')!).event.defaultPrevented).toBe(true);
    expect(callbacks.onDragStart).not.toHaveBeenCalled();
    const result = drag(handle);
    expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
    expect(result.setDragImage).toHaveBeenCalledWith(pad, 0, 0);
    act(() => container.querySelector<HTMLButtonElement>('.track-trigger')!.click());
    expect(callbacks.onPrimary).not.toHaveBeenCalled();
  });
  it('conserve la lecture, le clic droit, l’édition et les sorties audio disponibles', () => {
    const { container, callbacks } = setup();
    act(() => container.querySelector<HTMLButtonElement>('.track-trigger')!.click());
    act(() => container.querySelector('.track-trigger')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    act(() => container.querySelector<HTMLButtonElement>('.track-edit')!.click());
    act(() => container.querySelector<HTMLButtonElement>('.track-output-plays button')!.click());
    expect(callbacks.onPrimary).toHaveBeenCalledTimes(1);
    expect(callbacks.onSecondary).toHaveBeenCalledTimes(1);
    expect(callbacks.onEdit).toHaveBeenCalledTimes(1);
    expect(callbacks.onOutputPlay).toHaveBeenCalledWith('other');
  });
  it('permet de saisir directement une carte sélectionnée pour déplacer le lot', () => {
    const { pad, callbacks } = setup(true, true);
    expect(pad.draggable).toBe(true);
    drag(pad);
    expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
    act(() => pad.click());
    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });
  it('laisse les cartes non sélectionnées disponibles pour la sélection', () => {
    const { pad, handle, callbacks } = setup(true, false);
    expect(pad.draggable).toBe(false);
    expect(handle.draggable).toBe(false);
    expect(drag(handle).event.defaultPrevented).toBe(true);
    act(() => pad.click());
    expect(callbacks.onSelect).toHaveBeenCalledTimes(1);
  });
  it('ne capture pas un geste tactile sur le bouton de lecture', () => {
    const { pad, container, callbacks } = setup();
    pad.setPointerCapture = vi.fn();
    const trigger = container.querySelector<HTMLElement>('.track-trigger')!;
    pointer(trigger, 'pointerdown', 20);
    pointer(trigger, 'pointermove', 40);
    expect(pad.setPointerCapture).not.toHaveBeenCalled();
    expect(callbacks.onMobileDragStart).not.toHaveBeenCalled();
    act(() => trigger.click());
    expect(callbacks.onPrimary).toHaveBeenCalledTimes(1);
  });
  it('désactive la poignée pendant une opération qui interdit les déplacements', () => {
    const { handle, callbacks } = setup(false, false, false);
    expect(handle.draggable).toBe(false);
    expect(drag(handle).event.defaultPrevented).toBe(true);
    expect(callbacks.onDragStart).not.toHaveBeenCalled();
  });
});
