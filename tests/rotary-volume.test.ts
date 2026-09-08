// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RotaryVolume } from '../src/client/components/RotaryVolume.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); });

function setup(disabled = false) {
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  const change = vi.fn();
  act(() => root.render(createElement(RotaryVolume, { value: 50, label: 'Volume du son', disabled, onChange: change })));
  const input = element.querySelector('input')!;
  let captured: number | undefined;
  input.setPointerCapture = (id) => { captured = id; };
  input.hasPointerCapture = (id) => captured === id;
  input.releasePointerCapture = () => { captured = undefined; };
  cleanups.push(() => { act(() => root.unmount()); element.remove(); });
  return { input, change };
}
function pointer(input: HTMLInputElement, type: string, y: number, pointerId = 1, pointerType = 'mouse') {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientY: y });
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType } });
  act(() => input.dispatchEvent(event));
}

describe('potentiomètre de volume', () => {
  it.each(['mouse', 'touch'])('ajuste progressivement avec %s, sans saut au premier contact et entre 0 et 100', (pointerType) => {
    const { input, change } = setup();
    pointer(input, 'pointerdown', 200, 1, pointerType);
    expect(change).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    pointer(input, 'pointermove', 160, 1, pointerType);
    expect(change).toHaveBeenLastCalledWith(70);
    pointer(input, 'pointermove', -200, 1, pointerType);
    expect(change).toHaveBeenLastCalledWith(100);
    pointer(input, 'pointermove', 600, 1, pointerType);
    expect(change).toHaveBeenLastCalledWith(0);
    pointer(input, 'pointerup', 600, 1, pointerType);
    expect(input.hasPointerCapture(1)).toBe(false);
    change.mockClear();
    pointer(input, 'pointermove', 20, 1, pointerType);
    expect(change).not.toHaveBeenCalled();
  });
  it('ignore un second doigt et arrête le réglage après annulation', () => {
    const { input, change } = setup();
    pointer(input, 'pointerdown', 100);
    pointer(input, 'pointermove', 0, 2);
    expect(change).not.toHaveBeenCalled();
    pointer(input, 'pointercancel', 100);
    pointer(input, 'pointermove', 0);
    expect(change).not.toHaveBeenCalled();
  });
  it('conserve un slider natif nommé et bloque le réglage désactivé', () => {
    const { input, change } = setup(true);
    expect(input.type).toBe('range');
    expect(input.getAttribute('aria-label')).toBe('Volume du son');
    expect(input.getAttribute('aria-valuetext')).toBe('50 %');
    expect(input.disabled).toBe(true);
    pointer(input, 'pointerdown', 100);
    pointer(input, 'pointermove', 0);
    expect(change).not.toHaveBeenCalled();
  });
});
