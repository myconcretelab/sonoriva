import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatShortcut,
  projectShortcut,
  resolvePrimaryShortcut,
  shortcutFromKeyboardEvent,
  trackIndexFromKeyboardEvent,
  trackShortcutLabel,
} from '../src/client/lib/keyboard-shortcuts';

function keyboardEvent(input: Partial<KeyboardEvent> & Pick<KeyboardEvent, 'key' | 'code'>): KeyboardEvent {
  return {
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    getModifierState: () => false,
    ...input,
  } as KeyboardEvent;
}

describe('raccourcis clavier', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('applique les affectations par défaut lorsqu’un spectacle ancien ne les fournit pas', () => {
    expect(projectShortcut({}, 'nextCategoryShortcut')).toBe('Tab');
    expect(projectShortcut({}, 'crossfadeTrackShortcut')).toBe('Control+TrackKey');
    expect(projectShortcut({}, 'secondaryOutputHoldShortcut')).toBe('Shift');
    expect(projectShortcut({}, 'quickLaunchShortcut')).toBe('Enter');
    expect(projectShortcut({}, 'searchShortcut')).toBe('Primary+KeyK');
  });

  it('reconnaît les positions 1 à 9 indépendamment du caractère produit par le clavier', () => {
    const event = keyboardEvent({ key: '&', code: 'Digit1' });
    expect(trackIndexFromKeyboardEvent(event)).toBe(0);
    expect(shortcutFromKeyboardEvent(event, [], true)).toBe('TrackKey');
  });

  it('peut ignorer Maj maintenue pour envoyer un départ vers la sortie secondaire', () => {
    const event = keyboardEvent({ key: '1', code: 'Digit1', shiftKey: true });
    expect(shortcutFromKeyboardEvent(event, [], true)).toBe('Shift+TrackKey');
    expect(shortcutFromKeyboardEvent(event, ['Shift'], true)).toBe('TrackKey');
  });

  it('continue les chiffres avec les lettres A à Z', () => {
    expect(trackIndexFromKeyboardEvent(keyboardEvent({ key: 'a', code: 'KeyA' }))).toBe(9);
    expect(trackIndexFromKeyboardEvent(keyboardEvent({ key: 'z', code: 'KeyZ' }))).toBe(34);
    expect(trackShortcutLabel(0)).toBe('1');
    expect(trackShortcutLabel(9)).toBe('A');
    expect(trackShortcutLabel(34)).toBe('Z');
    expect(trackShortcutLabel(35)).toBeUndefined();
  });

  it('affiche et résout le raccourci principal selon le système', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows' });
    expect(resolvePrimaryShortcut('Primary+KeyK')).toBe('Control+KeyK');
    expect(formatShortcut('Primary+KeyK')).toBe('Ctrl + K');
    expect(formatShortcut('Meta+KeyK')).toBe('⊞ + K');
  });

  it('normalise le plus principal ou numérique sans imposer Maj', () => {
    expect(shortcutFromKeyboardEvent(keyboardEvent({ key: '+', code: 'Equal', shiftKey: true }))).toBe('Plus');
    expect(shortcutFromKeyboardEvent(keyboardEvent({ key: '+', code: 'NumpadAdd', ctrlKey: true }))).toBe('Control+Plus');
  });

  it('affiche les combinaisons avec des libellés français', () => {
    expect(formatShortcut('Control+TrackKey')).toBe('Ctrl + Touches 1–9 / A–Z');
    expect(formatShortcut('AltGraph')).toBe('AltGr');
  });
});
