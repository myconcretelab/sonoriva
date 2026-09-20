import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlaybackOutputSelector } from '../src/client/components/PlaybackOutputSelector.js';
import { TrackPad } from '../src/client/components/TrackPad.js';
import type { RoutedBridgeOutput } from '../src/client/lib/bridge-output-routing.js';
import type { Track } from '../src/client/types.js';

const outputs: RoutedBridgeOutput[] = [
  { id: 'speakers', name: 'Haut-parleurs', isDefault: true, color: '#22c55e' },
  { id: 'usb', name: 'Jean Luc', isDefault: false, color: '#3b82f6' },
];

describe('sélecteur de sortie d’une lecture', () => {
  it('affiche une LED cliquable et toutes les sorties', () => {
    const markup = renderToStaticMarkup(createElement(PlaybackOutputSelector, { title: 'Ouverture', outputId: 'usb', outputs, disabled: false, onChange: () => undefined }));
    expect(markup).toContain('player-output-selector');
    expect(markup).toContain('--output-color:#3b82f6');
    expect(markup).toContain('aria-label="Sortie de lecture de Ouverture"');
    expect(markup).toContain('Jean Luc');
  });

  it('reste masqué lorsqu’une seule sortie est disponible', () => {
    expect(renderToStaticMarkup(createElement(PlaybackOutputSelector, { title: 'Ouverture', outputId: 'speakers', outputs: outputs.slice(0, 1), disabled: false, onChange: () => undefined }))).toBe('');
  });

  it('entoure le Play principal et ajoute seulement les Plays des autres sorties', () => {
    const track = { id: 'track-1', title: 'Ouverture', durationMs: 60_000, startTimeMs: 0, endTimeMs: null, volume: 1, loop: false } as Track;
    const ignore = () => undefined;
    const markup = renderToStaticMarkup(createElement(TrackPad, { track, color: '#22d3b6', active: false, playbacks: [], historyProgress: 0, loaded: false, dragEnabled: true, dropTarget: false, bridgeOutputs: outputs, mainBridgeOutputId: 'speakers', onPrimary: ignore, onOutputPlay: ignore, onSecondary: ignore, onEdit: ignore, onDragStart: ignore, onDragOver: ignore, onDrop: ignore, onDragEnd: ignore }));
    expect(markup).toContain('play-disc has-output-route');
    expect(markup).toContain('--main-output-color:#22c55e');
    expect(markup).not.toContain('aria-label="Jouer Ouverture sur Haut-parleurs"');
    expect(markup).toContain('aria-label="Jouer Ouverture sur Jean Luc"');
  });

  it('conserve un Play pour chaque sortie secondaire', () => {
    const track = { id: 'track-1', title: 'Ouverture', durationMs: 60_000, startTimeMs: 0, endTimeMs: null, volume: 1, loop: false } as Track;
    const ignore = () => undefined;
    const extendedOutputs = [
      ...outputs,
      { id: 'stage-left', name: 'Scène gauche', isDefault: false, color: '#f59e0b' },
      { id: 'stage-right', name: 'Scène droite', isDefault: false, color: '#ec4899' },
    ];
    const markup = renderToStaticMarkup(createElement(TrackPad, { track, color: '#22d3b6', active: false, playbacks: [], historyProgress: 0, loaded: false, dragEnabled: true, dropTarget: false, bridgeOutputs: extendedOutputs, mainBridgeOutputId: 'speakers', onPrimary: ignore, onOutputPlay: ignore, onSecondary: ignore, onEdit: ignore, onDragStart: ignore, onDragOver: ignore, onDrop: ignore, onDragEnd: ignore }));
    expect(markup.match(/aria-label="Jouer Ouverture sur/g)).toHaveLength(3);
    expect(markup).toContain('aria-label="Jouer Ouverture sur Jean Luc"');
    expect(markup).toContain('aria-label="Jouer Ouverture sur Scène gauche"');
    expect(markup).toContain('aria-label="Jouer Ouverture sur Scène droite"');
  });
});
