import { expect, it, vi } from 'vitest';
import { applyPlaylistSoundboardBehavior } from '../src/client/lib/playlist-interruption';
function fixture() {
  return { action: 'replace' as const, running: true, ownedIds: new Set(['playing', 'paused', 'outgoing']),
    playbacks: [{ id: 'playing', paused: false }, { id: 'paused', paused: true }, { id: 'outgoing', paused: false, fadingOut: true }, { id: 'other', paused: false }],
    suspend: vi.fn(), pause: vi.fn(), stop: vi.fn() };
}
it('continue la playlist même avec un clic de remplacement et protège ses instances', () => {
  const input = fixture();
  expect(applyPlaylistSoundboardBehavior({ ...input, behavior: 'continue' })).toBe(input.ownedIds);
  expect(input.suspend).not.toHaveBeenCalled();
  expect(input.stop).not.toHaveBeenCalled();
});
it('met seulement les lectures de playlist non suspendues en pause sans les reprendre au clic suivant', () => {
  const input = fixture();
  expect(applyPlaylistSoundboardBehavior({ ...input, behavior: 'pause' })).toBe(input.ownedIds);
  expect(input.suspend).toHaveBeenCalledWith('pause');
  expect(input.pause.mock.calls).toEqual([['playing']]);
  expect(input.stop.mock.calls).toEqual([['outgoing']]);
});
it('arrête toutes les instances de playlist, y compris le fondu sortant, sans toucher aux autres sons', () => {
  const input = fixture();
  expect(applyPlaylistSoundboardBehavior({ ...input, behavior: 'stop' })).toBeUndefined();
  expect(input.stop.mock.calls).toEqual([['playing'], ['paused'], ['outgoing']]);
  expect(input.suspend).toHaveBeenCalledWith('stop');
  expect(input.ownedIds.size).toBe(0);
});
it.each(['pause', 'stop'] as const)('suspend une préparation ou un intervalle sans lecture active (%s)', behavior => {
  const input = fixture();
  applyPlaylistSoundboardBehavior({ ...input, playbacks: [], behavior });
  expect(input.suspend).toHaveBeenCalledWith(behavior);
});
it.each(['stop', 'none'] as const)('ne modifie pas la playlist pour un clic sans lancement (%s)', action => {
  const input = fixture();
  applyPlaylistSoundboardBehavior({ ...input, action, behavior: 'pause' });
  expect(input.suspend).not.toHaveBeenCalled();
  expect(input.pause).not.toHaveBeenCalled();
});
