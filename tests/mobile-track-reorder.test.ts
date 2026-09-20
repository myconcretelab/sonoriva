// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { TrackPad } from '../src/client/components/TrackPad.js';
import { mobileTrackAutoScrollDelta, mobileTrackDragActivated } from '../src/client/lib/mobile-track-reorder.js';
import type { Track } from '../src/client/types.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const track: Track = {
  id: 'track', projectId: 'project', categoryId: 'category', subcategoryId: null, title: 'Son mobile', originalFilename: 'son.wav', mimeType: 'audio/wav', sizeBytes: 1,
  durationMs: 1_000, startTimeMs: 0, endTimeMs: null, volume: 1, loop: false, fadeInMs: 0, fadeOutMs: 0, color: null, tags: [], description: null,
  copyrightText: null, sourceUrl: null, sourceId: null, position: 0, createdAt: '',
};

function pointerEvent(type: string, clientX: number, clientY: number, pointerType = 'touch') {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
  Object.defineProperties(event, {
    pointerId: { value: 7 },
    pointerType: { value: pointerType },
  });
  return event;
}

describe('réorganisation tactile des morceaux', () => {
  it('attend un déplacement réel avant de démarrer le glisser tactile', () => {
    const start = { clientX: 100, clientY: 100 };
    expect(mobileTrackDragActivated(start, { clientX: 105, clientY: 104 })).toBe(false);
    expect(mobileTrackDragActivated(start, { clientX: 109, clientY: 100 })).toBe(true);
  });

  it('fait défiler la page uniquement près des bords du mobile', () => {
    expect(mobileTrackAutoScrollDelta(400, 800)).toBe(0);
    expect(mobileTrackAutoScrollDelta(0, 800)).toBe(-22);
    expect(mobileTrackAutoScrollDelta(800, 800)).toBe(22);
  });

  it('déclenche le déplacement après le seuil tactile et transmet la position finale', () => {
    const start = vi.fn();
    const move = vi.fn();
    const end = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const ignore = () => undefined;
    const captures = new Set<number>();
    HTMLElement.prototype.setPointerCapture = (pointerId) => { captures.add(pointerId); };
    HTMLElement.prototype.hasPointerCapture = (pointerId) => captures.has(pointerId);
    HTMLElement.prototype.releasePointerCapture = (pointerId) => { captures.delete(pointerId); };

    act(() => root.render(createElement(TrackPad, {
      track, color: '#22d3b6', active: false, playbacks: [], historyProgress: 0, loaded: false, dragEnabled: true,
      selectionMode: false, selected: false, dropTarget: false, bridgeOutputs: [], onPrimary: ignore, onOutputPlay: ignore, onSecondary: ignore, onEdit: ignore,
      onSelect: ignore, onDragStart: ignore, onDragOver: ignore, onDrop: ignore, onDragEnd: ignore, mobileDragEnabled: true,
      onMobileDragStart: start, onMobileDragMove: move, onMobileDragEnd: end,
    })));
    const pad = container.querySelector<HTMLElement>('[data-track-id]')!;
    const handle = container.querySelector<HTMLElement>('[data-track-drag-handle]')!;

    act(() => handle.dispatchEvent(pointerEvent('pointerdown', 20, 20)));
    expect(pad.style.getPropertyValue('-webkit-user-drag')).toBe('none');
    act(() => pad.dispatchEvent(pointerEvent('pointermove', 25, 24)));
    expect(start).not.toHaveBeenCalled();
    act(() => pad.dispatchEvent(pointerEvent('pointermove', 33, 20)));
    expect(start).toHaveBeenCalledWith({ clientX: 33, clientY: 20 });
    expect(move).toHaveBeenCalledWith({ clientX: 33, clientY: 20 });
    act(() => pad.dispatchEvent(pointerEvent('pointerup', 40, 28)));
    expect(end).toHaveBeenCalledWith({ clientX: 40, clientY: 28 }, false);
    expect(pad.style.getPropertyValue('-webkit-user-drag')).toBe('');

    act(() => root.unmount());
    container.remove();
  });

  it('conserve le glisser natif avec une souris de bureau', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const ignore = () => undefined;

    act(() => root.render(createElement(TrackPad, {
      track, color: '#22d3b6', active: false, playbacks: [], historyProgress: 0, loaded: false, dragEnabled: true,
      selectionMode: true, selected: true, dropTarget: false, bridgeOutputs: [], onPrimary: ignore, onOutputPlay: ignore, onSecondary: ignore, onEdit: ignore,
      onSelect: ignore, onDragStart: ignore, onDragOver: ignore, onDrop: ignore, onDragEnd: ignore, mobileDragEnabled: true,
    })));
    const pad = container.querySelector<HTMLElement>('[data-track-id]')!;

    expect(pad.draggable).toBe(true);
    act(() => pad.dispatchEvent(pointerEvent('pointerdown', 20, 20, 'mouse')));
    expect(pad.style.getPropertyValue('-webkit-user-drag')).toBe('');

    act(() => root.unmount());
    container.remove();
  });

  it('relie les gestes tactiles aux cibles de morceaux, sous-catégories et catégories', () => {
    const app = readFileSync('src/client/App.tsx', 'utf8');
    const trackPad = readFileSync('src/client/components/TrackPad.tsx', 'utf8');
    const styles = readFileSync('src/client/styles.css', 'utf8');

    expect(trackPad).toContain('onPointerDown={beginMobileDrag}');
    expect(trackPad).toContain("event.pointerType === 'mouse'");
    expect(app).toContain('document.elementFromPoint(point.clientX, point.clientY)');
    expect(app).toContain("target.kind === 'subcategory'");
    expect(app).toContain("target.kind === 'category'");
    expect(app).toContain('mobile-track-drag-preview');
    expect(styles).toContain('.track-pad.mobile-drag-enabled .track-meta, .track-pad.mobile-drag-enabled.selection-enabled.is-selected { touch-action: none; }');
    expect(styles).not.toContain('.track-pad.mobile-drag-enabled { touch-action: none; -webkit-user-drag: none; }');
  });
});
