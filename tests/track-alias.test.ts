import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TrackPad } from '../src/client/components/TrackPad';
import { trackAliasCounts } from '../src/client/lib/track-aliases';
import type { Track } from '../src/client/types';

const track = (id: string, storageKey?: string): Track => ({
  id,
  projectId: 'project',
  categoryId: null,
  subcategoryId: null,
  title: id,
  originalFilename: `${id}.wav`,
  storageKey,
  mimeType: 'audio/wav',
  sizeBytes: 1,
  durationMs: 1_000,
  startTimeMs: 0,
  endTimeMs: null,
  volume: 1,
  loop: false,
  fadeInMs: 0,
  fadeOutMs: 0,
  color: null,
  tags: [],
  description: null,
  copyrightText: null,
  sourceUrl: null,
  sourceId: null,
  position: 0,
  createdAt: '',
});

describe('alias de morceau', () => {
  it('compte uniquement les morceaux qui partagent le même fichier dans le spectacle', () => {
    const tracks = [track('one', 'shared.wav'), track('two', 'shared.wav'), track('three', 'other.wav'), track('legacy')];
    const counts = trackAliasCounts(tracks);
    expect([...counts.entries()]).toEqual([['one', 2], ['two', 2], ['three', 1], ['legacy', 1]]);
  });

  it.each(['original', 'studio', 'porcelain', 'tape'])('affiche le compteur compact dans le thème %s', (skin) => {
    const ignore = () => undefined;
    const markup = renderToStaticMarkup(createElement(TrackPad, {
      track: track(`track-${skin}`, 'shared.wav'),
      color: '#22d3b6',
      aliasCount: 3,
      active: false,
      playbacks: [],
      historyProgress: 0,
      loaded: false,
      dragEnabled: false,
      selectionMode: false,
      selected: false,
      dropTarget: false,
      bridgeOutputs: [],
      onPrimary: ignore,
      onOutputPlay: ignore,
      onSecondary: ignore,
      onEdit: ignore,
      onSelect: ignore,
      onDragStart: ignore,
      onDragOver: ignore,
      onDrop: ignore,
      onDragEnd: ignore,
    }));
    expect(markup).toContain('class="track-alias-count"');
    expect(markup).toContain('3 exemplaires du même fichier');
    expect(markup).toContain('<b>3</b>');
  });
});
