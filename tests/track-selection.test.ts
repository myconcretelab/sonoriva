import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TrackPad } from '../src/client/components/TrackPad.js';
import { intersectsSelection } from '../src/client/lib/track-selection.js';
import type { Track } from '../src/client/types.js';

describe('rectangle de sélection des morceaux', () => {
  const card = { left: 100, right: 200, top: 100, bottom: 200 };

  it('sélectionne une carte touchée par le rectangle dans les deux sens de tracé', () => {
    expect(intersectsSelection(card, { startX: 50, startY: 50, currentX: 150, currentY: 150 })).toBe(true);
    expect(intersectsSelection(card, { startX: 250, startY: 250, currentX: 150, currentY: 150 })).toBe(true);
  });

  it('ignore une carte extérieure au rectangle', () => {
    expect(intersectsSelection(card, { startX: 210, startY: 210, currentX: 300, currentY: 300 })).toBe(false);
  });

  it('rend une carte sélectionnée déplaçable sans activer le mode réorganisation', () => {
    const track = {
      id: 'track', projectId: 'project', categoryId: 'category', subcategoryId: null, title: 'Son', originalFilename: 'son.wav', mimeType: 'audio/wav', sizeBytes: 1,
      durationMs: 1_000, startTimeMs: 0, endTimeMs: null, volume: 1, loop: false, fadeInMs: 0, fadeOutMs: 0, color: null, tags: [], description: null,
      copyrightText: null, sourceUrl: null, sourceId: null, position: 0, createdAt: '',
    } satisfies Track;
    const ignore = () => undefined;
    const markup = renderToStaticMarkup(createElement(TrackPad, {
      track, color: '#22d3b6', active: false, playbacks: [], historyProgress: 0, loaded: false, dragEnabled: true,
      selectionMode: true, selected: true, dropTarget: false, bridgeOutputs: [], onPrimary: ignore, onOutputPlay: ignore, onSecondary: ignore, onEdit: ignore,
      onSelect: ignore, onDragStart: ignore, onDragOver: ignore, onDrop: ignore, onDragEnd: ignore,
    }));

    expect(markup).toContain('draggable="true"');
    expect(markup).toContain('selection-enabled is-selected');
  });

  it('affiche toute la sélection pendant le déplacement et active les cibles de regroupement', () => {
    const app = readFileSync(new URL('../src/client/App.tsx', import.meta.url), 'utf8');
    const styles = readFileSync(new URL('../src/client/styles.css', import.meta.url), 'utf8');
    expect(app).toContain('setSelectionDragImage(event, selectedTracks)');
    expect(app).toContain("setDropTrackPlacement(draggingSelectedTracks ? 'group'");
    expect(app).toContain('createSubcategoryFromSelectedTracks(track)');
    expect(styles).toContain('.selection-drag-preview-card');
    expect(styles).toContain('@keyframes drop-target-march');
  });
});
