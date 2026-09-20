import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioEngine } from '../src/client/lib/audio-engine';
import { bridgeClient } from '../src/client/lib/bridge-client';
import type { Track } from '../src/client/types';

const track = { id: 'bridge-history', mimeType: 'audio/wav', fadeInMs: 0 } as Track;
afterEach(() => { vi.restoreAllMocks(); audioEngine.resetHistory(); });

describe('Bridge played history', () => {
  it('remembers an acknowledged short sound even without a status poll', async () => {
    vi.spyOn(bridgeClient, 'isEnabled').mockReturnValue(true);
    vi.spyOn(bridgeClient, 'getPlaybacks').mockReturnValue([]);
    vi.spyOn(bridgeClient, 'play').mockResolvedValue('playback');
    let history = new Map<string, number>();
    const unsubscribe = audioEngine.subscribeHistory(value => { history = value; });
    await audioEngine.play(track);
    expect(history.get(track.id)).toBeGreaterThan(0);
    audioEngine.resetHistory([track.id]);
    expect(history.has(track.id)).toBe(false);
    unsubscribe();
  });
  it('does not mark a rejected launch', async () => {
    vi.spyOn(bridgeClient, 'isEnabled').mockReturnValue(true);
    vi.spyOn(bridgeClient, 'getPlaybacks').mockReturnValue([]);
    vi.spyOn(bridgeClient, 'play').mockRejectedValue(new Error('Fichier absent'));
    let history = new Map<string, number>();
    const unsubscribe = audioEngine.subscribeHistory(value => { history = value; });
    await expect(audioEngine.play(track)).rejects.toThrow('Fichier absent');
    expect(history.has(track.id)).toBe(false);
    unsubscribe();
  });
  it('records main-channel progress from Bridge status but excludes previews', () => {
    vi.spyOn(bridgeClient, 'isEnabled').mockReturnValue(true);
    let notify = () => {};
    vi.spyOn(bridgeClient, 'subscribe').mockImplementation(listener => { notify = listener; return () => {}; });
    const playback = { id: 'main', trackId: track.id, channel: 'main', positionMs: 250, durationMs: 1000, sequence: 1, loopPlayback: false, paused: false, volume: 1, fadingOut: false };
    vi.spyOn(bridgeClient, 'getPlaybacks').mockReturnValue([playback, { ...playback, id: 'preview', trackId: 'preview-only', channel: 'preview' }] as ReturnType<typeof bridgeClient.getPlaybacks>);
    let history = new Map<string, number>();
    const unhistory = audioEngine.subscribeHistory(value => { history = value; });
    const unsubscribe = audioEngine.subscribe(() => {});
    notify();
    expect(history.get(track.id)).toBe(.25);
    expect(history.has('preview-only')).toBe(false);
    unsubscribe(); unhistory();
  });
});
