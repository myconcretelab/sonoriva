// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayedSoundsControl } from '../src/client/components/PlayedSoundsControl';
import { applyGreyPlayed, defaultSoundboardViewSettings } from '../src/client/lib/soundboard-view';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
function setup(categoryId?: string) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Fixture() {
    const [settings, setSettings] = useState(defaultSoundboardViewSettings);
    return createElement('div', null,
      createElement(PlayedSoundsControl, { settings, categoryId, onChange: (enabled, category) => setSettings(current => applyGreyPlayed(current, enabled, category)) }),
      createElement('output', null, JSON.stringify(settings)));
  }
  act(() => root.render(createElement(Fixture)));
  cleanups.push(() => { act(() => root.unmount()); container.remove(); });
  return { container, settings: () => JSON.parse(container.querySelector('output')!.textContent!) };
}

describe('played sounds dashboard control', () => {
  it('toggles the current category and applies a global choice after selecting its scope', () => {
    const { container, settings } = setup('scene');
    act(() => container.querySelector<HTMLButtonElement>('[aria-pressed]')!.click());
    expect(settings().categoryGreyPlayed).toEqual({ scene: true });
    expect(settings().greyPlayed).toBe(false);
    act(() => container.querySelector<HTMLButtonElement>('[aria-expanded]')!.click());
    const select = container.querySelector('select')!;
    act(() => { select.value = 'all'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(settings().greyPlayed).toBe(false);
    act(() => container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    expect(settings().greyPlayed).toBe(true);
    expect(settings().categoryGreyPlayed).toEqual({});
    act(() => container.querySelector<HTMLButtonElement>('[aria-pressed]')!.click());
    expect(settings().greyPlayed).toBe(false);
  });
  it('uses the global setting when no category is selected', () => {
    const { container, settings } = setup();
    act(() => container.querySelector<HTMLButtonElement>('[aria-pressed]')!.click());
    expect(settings().greyPlayed).toBe(true);
    expect(settings().categoryGreyPlayed).toEqual({});
    act(() => container.querySelector<HTMLButtonElement>('[aria-expanded]')!.click());
    expect(container.querySelector('option[value=category]')!.hasAttribute('disabled')).toBe(true);
  });
});
