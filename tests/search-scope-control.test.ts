// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchScopeControl } from '../src/client/components/SearchScopeControl';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

function setup() {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(createElement(SearchScopeControl, {
    scopes: new Set(['name']),
    onToggle: () => undefined,
    children: createElement('input', { 'aria-label': 'Recherche' }),
  })));
  cleanups.push(() => { act(() => root.unmount()); container.remove(); });
  return container.querySelector<HTMLInputElement>('input')!;
}

describe('filtres de recherche', () => {
  it('laisse Échap remonter depuis le champ de recherche', () => {
    const input = setup();
    const onKeyDown = vi.fn();
    window.addEventListener('keydown', onKeyDown);
    cleanups.push(() => window.removeEventListener('keydown', onKeyDown));

    act(() => input.focus());
    expect(document.querySelector('[aria-label="Filtres de recherche cumulables"]')).not.toBeNull();
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[aria-label="Filtres de recherche cumulables"]')).toBeNull();
  });
});
