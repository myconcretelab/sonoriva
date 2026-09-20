import { afterEach, expect, it, vi } from 'vitest';
import { PlaybackRequests } from '../src/client/lib/playback-requests';

afterEach(() => vi.useRealTimers());

it('rejette après dix secondes et ne reprend pas quand le chargement finit tardivement', async () => {
  vi.useFakeTimers();
  const requests = new PlaybackRequests();
  const launch = requests.begin('slow');
  let finish!: () => void;
  const start = vi.fn();
  const playback = launch.wait(new Promise<void>((resolve) => { finish = resolve; })).then(start);
  const rejected = expect(playback).rejects.toThrow('10 secondes');
  await vi.advanceTimersByTimeAsync(10_000);
  await rejected;
  finish();
  await Promise.resolve();
  expect(start).not.toHaveBeenCalled();
  launch.finish();
});

it('annule uniquement les demandes du son arrêté, puis toutes les demandes restantes', async () => {
  const requests = new PlaybackRequests();
  const first = requests.begin('first');
  const second = requests.begin('second');
  requests.cancel('first');
  expect(first.signal.aborted).toBe(true);
  expect(second.signal.aborted).toBe(false);
  requests.cancel();
  expect(second.signal.aborted).toBe(true);
  first.finish(); second.finish();
});

it('partage un délai absolu entre le préchargement et le lancement', async () => {
  vi.useFakeTimers();
  const requests = new PlaybackRequests();
  const expires = Date.now() + 10_000;
  const prepare = requests.begin('sound', expires);
  await prepare.wait(Promise.resolve());
  prepare.finish();
  await vi.advanceTimersByTimeAsync(9000);
  const launch = requests.begin('sound', expires);
  const rejected = expect(launch.wait(new Promise(() => {}))).rejects.toThrow('10 secondes');
  await vi.advanceTimersByTimeAsync(1000);
  await rejected;
  launch.finish();
});
