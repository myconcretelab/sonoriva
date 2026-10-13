// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackVolumeControl } from '../src/client/components/PlaybackVolumeControl';
import type { ActivePlayback } from '../src/client/lib/audio-engine';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('volume visuel pendant un fondu', () => {
  it.each([
    ['original', false],
    ['studio', false],
    ['porcelain', false],
    ['tape', true],
  ])('progresse du silence au volume cible dans le thème %s', (skin, rotary) => {
    let now = 1_000;
    let nextFrame: FrameRequestCallback | undefined;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { nextFrame = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    document.documentElement.dataset.skin = skin;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const playback = {
      id: `fade-${skin}`,
      trackId: 'track',
      sequence: 1,
      startedAtMs: now,
      resumedAtMs: now,
      elapsedMs: 0,
      durationMs: 10_000,
      loop: false,
      paused: false,
      volume: 1,
      volumeFrom: 0,
      volumeTransitionStartedAtMs: now,
      volumeTransitionDurationMs: 2_000,
      fadingOut: false,
    } satisfies ActivePlayback;

    act(() => root.render(createElement(PlaybackVolumeControl, { playback, title: 'Fondu', rotary, onChange: vi.fn() })));
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.value).toBe('0');

    now = 2_000;
    act(() => nextFrame?.(now));
    expect(slider.value).toBe('50');
    expect(slider.style.getPropertyValue('--slider-progress')).toBe(rotary ? '' : '50%');

    now = 3_000;
    act(() => nextFrame?.(now));
    expect(slider.value).toBe('100');
    if (rotary) expect(slider.getAttribute('aria-valuetext')).toBe('100 %');

    cleanups.push(() => { act(() => root.unmount()); container.remove(); });
  });
});
