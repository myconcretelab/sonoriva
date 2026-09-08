// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { RetroActionSelector } from '../src/client/components/RetroActionSelector';
import type { MouseAction } from '../src/client/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('sélectionne les actions voisines et respecte les butées', () => {
  const element = document.createElement('div');
  const root = createRoot(element);
  const onChange = vi.fn();
  const options: Array<{ value: MouseAction; label: string }> = [
    { value: 'start', label: 'Démarrer' },
    { value: 'crossfade', label: 'Fondu enchaîné' },
    { value: 'none', label: 'Aucune action' },
  ];
  function render(value: MouseAction) { act(() => root.render(createElement(RetroActionSelector, { label: 'Clic gauche', value, options, onChange }))); }
  try {
    render('start');
    let buttons = element.querySelectorAll('button');
    expect(buttons[0].disabled).toBe(true);
    act(() => buttons[1].click());
    expect(onChange).toHaveBeenLastCalledWith('crossfade');
    render('crossfade');
    expect(element.querySelector('output')?.textContent).toBe('Fondu enchaîné');
    buttons = element.querySelectorAll('button');
    act(() => buttons[0].click());
    expect(onChange).toHaveBeenLastCalledWith('start');
    render('none');
    expect(element.querySelectorAll('button')[1].disabled).toBe(true);
    expect(element.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Clic gauche');
  } finally { act(() => root.unmount()); }
});
