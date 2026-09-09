// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { videoBounds, videoEngine, isVideoTrack } from '../src/client/lib/video-engine';
import type { Track } from '../src/client/types';

const track = { id: 'video-1', title: 'Projection', mimeType: 'video/mp4', startTimeMs: 1000, endTimeMs: 4000, volume: .8, loop: false } as Track;
let popup: Window;
let paused = true;
let finishLoad = true;
beforeEach(() => {
  vi.useFakeTimers();
  paused = true; finishLoad = true;
  const doc = document.implementation.createHTMLDocument();
  Object.defineProperty(doc, 'readyState', { value: 'complete' });
  popup = { setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window), location: { pathname: '/projection.html' }, document: doc, closed: false, focus: vi.fn(), close: vi.fn(), addEventListener: vi.fn() } as unknown as Window;
  vi.spyOn(window, 'open').mockReturnValue(popup);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) { if (this.getAttribute('src') && finishLoad) queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata'))); });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => { paused = false; });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => { paused = true; });
  vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(10);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
});
afterEach(() => { videoEngine.close(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('projection vidéo', () => {
  it('distingue vidéo et audio et refuse des points hors durée', () => {
    expect(isVideoTrack(track)).toBe(true);
    expect(isVideoTrack({ mimeType: 'audio/mp4' })).toBe(false);
    expect(videoBounds(track, 3)).toEqual({ start: 1, end: 3 });
    expect(() => videoBounds({ startTimeMs: 11000, endTimeMs: null }, 10)).toThrow();
  });
  it('exige une fenêtre ouverte et signale les popups bloquées', async () => {
    await expect(videoEngine.play(track, 1, 0, 1)).rejects.toThrow('Ouvrez');
    vi.mocked(window.open).mockReturnValue(null);
    expect(() => videoEngine.open()).toThrow('bloquée');
  });
  it('joue la sélection avec volume maître et remplace la projection précédente', async () => {
    videoEngine.open(); await vi.advanceTimersByTimeAsync(50); videoEngine.setMasterVolume(.5);
    await videoEngine.play(track, 1, 0, 1);
    expect(videoEngine.getElement()?.currentTime).toBe(1);
    expect(videoEngine.getElement()?.volume).toBeCloseTo(.4);
    await videoEngine.play({ ...track, id: 'video-2' }, 2, 0, 1);
    expect(videoEngine.getPlaybacks()).toHaveLength(1);
    expect(videoEngine.getPlaybacks()[0]?.trackId).toBe('video-2');
    videoEngine.toggleBlack();
    expect(videoEngine.getElement()?.style.visibility).toBe('hidden');
    expect(videoEngine.getPlaybacks()).toHaveLength(1);
    videoEngine.stop();
    expect(videoEngine.getPlaybacks()).toEqual([]);
    expect(videoEngine.getElement()?.hasAttribute('src')).toBe(false);
  });
  it('boucle sur la sélection puis conserve la dernière image si demandé', async () => {
    videoEngine.open(); await vi.advanceTimersByTimeAsync(50);
    await videoEngine.play({ ...track, loop: true, videoEndBehavior: 'hold' }, 1, 0, 1);
    videoEngine.getElement()!.currentTime = 4;
    await vi.advanceTimersByTimeAsync(50);
    expect(videoEngine.getElement()?.currentTime).toBe(1);
    videoEngine.setLoop(false);
    videoEngine.getElement()!.currentTime = 4;
    await vi.advanceTimersByTimeAsync(50);
    expect(videoEngine.getPlaybacks()).toEqual([]);
    expect(videoEngine.getElement()?.style.visibility).toBe('visible');
    videoEngine.stop();
    expect(videoEngine.getElement()?.style.visibility).toBe('hidden');
  });
  it('annule le démarrage si un arrêt arrive pendant le chargement', async () => {
    videoEngine.open(); await vi.advanceTimersByTimeAsync(50); finishLoad = false;
    const promise = videoEngine.play(track, 1, 0, 1);
    videoEngine.stop();
    videoEngine.getElement()!.dispatchEvent(new Event('loadedmetadata'));
    await expect(promise).rejects.toThrow('annulée');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(videoEngine.getPlaybacks()).toEqual([]);
  });
  it('remonte un refus de lecture sans conserver une lecture active', async () => {
    videoEngine.open(); await vi.advanceTimersByTimeAsync(50);
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('Autoplay refusé'));
    await expect(videoEngine.play(track, 1, 0, 1)).rejects.toThrow('Autoplay refusé');
    expect(videoEngine.getState().error).toBe('Autoplay refusé');
    expect(videoEngine.getPlaybacks()).toEqual([]);
  });
});
