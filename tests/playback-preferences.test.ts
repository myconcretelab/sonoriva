import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('commandes de lecture et préférences de session', () => {
  const source = readFileSync(new URL('../src/client/App.tsx', import.meta.url), 'utf8');
  const playbackVolumeSource = readFileSync(new URL('../src/client/components/PlaybackVolumeControl.tsx', import.meta.url), 'utf8');
  const trackPadSource = readFileSync(new URL('../src/client/components/TrackPad.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/client/styles.css', import.meta.url), 'utf8');

  it('laisse les raccourcis globaux actifs pendant le réglage d’un curseur', () => {
    expect(source).toContain("event.target.type !== 'range'");
    expect(playbackVolumeSource).toContain('onPointerUp={(event) => event.currentTarget.blur()}');
  });

  it('donne le focus à la recherche avec son raccourci', () => {
    expect(source).toContain("projectShortcut(detail.project, 'searchShortcut')");
    expect(source).toContain('searchInputRef.current?.focus()');
    expect(source).toContain('ref={searchInputRef}');
  });

  it('relie les retours arrière au dernier lecteur', () => {
    expect(source).toContain("shiftBackspaceKeyAction ?? 'stop-last'");
    expect(source).toContain("backspaceKeyAction ?? 'stop-last-immediate'");
    expect(source).toContain("sendOrRun({ type: 'stop-last', immediate: false })");
    expect(source).toContain("sendOrRun({ type: 'stop-last', immediate: true })");
  });

  it('utilise l’action clavier configurée pour les touches des morceaux', () => {
    expect(source).toContain("runTrackAction(detail.project.keyboardAction ?? 'start', track)");
    expect(source).toContain('shortcut={trackShortcutLabel(shortcutIndex)}');
  });

  it('conserve le déclenchement des sons pendant la réorganisation des sous-catégories', () => {
    expect(trackPadSource).toContain("onClick={() => !selectionMode && onPrimary()}");
    expect(trackPadSource).not.toContain('!reorderEnabled && onPrimary()');
  });

  it('active automatiquement les lecteurs compacts au seuil du spectacle', () => {
    expect(source).toContain('playingTracks.length >= compactPlaybackThreshold');
    expect(source).toContain("now-playing-list ${compactPlayerCards ? 'is-compact' : ''}");
    expect(styles).toContain('.now-playing-list.is-compact .player-card { min-height: 54px;');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) 49px');
  });

  it('affine les deux réglettes du lecteur compact', () => {
    expect(styles).toContain('appearance: none; height: 3px;');
    expect(styles).toContain('width: 10px; height: 10px; margin-top: -3.5px;');
    expect(source).toContain("style.setProperty('--slider-progress'");
  });

  it('conserve le nombre de colonnes lors de la déconnexion', () => {
    expect(source).toContain("!key.startsWith('sonoriva-track-columns')");
    expect(source).toContain('trackColumnsStorageKey(detail.project.id, columnCategoryId');
  });

  it('permet de quitter la démonstration pour rejoindre la connexion', () => {
    expect(source).toContain('async function leaveDemoForLogin()');
    expect(source).toContain("window.history.replaceState({}, '', '/')");
    expect(source).toContain('Se connecter à mon compte');
  });
});
