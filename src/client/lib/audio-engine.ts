import { isVideoTrack, videoEngine } from './video-engine';
import type { MouseAction, Track } from '../types';
import { fetchTrackAudio } from './offline-audio';
import { bridgeClient, isBridgeUnavailableError, type AudioPlaybackMode } from './bridge-client';

export interface ActivePlayback {
  id: string;
  trackId: string;
  sequence: number;
  startedAtMs: number;
  resumedAtMs: number;
  elapsedMs: number;
  durationMs: number;
  loop: boolean;
  paused: boolean;
  volume: number;
  volumeFrom: number;
  volumeTransitionStartedAtMs: number;
  volumeTransitionDurationMs: number;
  fadingOut: boolean;
  outputId?: string;
}

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
}

export interface AudioOutputSelection {
  deviceId: string;
  label: string;
}

type PlaybackPosition = Pick<ActivePlayback, 'durationMs' | 'elapsedMs' | 'loop' | 'paused' | 'resumedAtMs'>;

export function playbackPositionAt(playback: PlaybackPosition, atMs = performance.now()): number {
  const elapsedMs = playback.paused
    ? playback.elapsedMs
    : playback.elapsedMs + Math.max(0, atMs - playback.resumedAtMs);
  if (playback.loop) return elapsedMs % playback.durationMs;
  return Math.min(elapsedMs, playback.durationMs);
}

interface Playback extends ActivePlayback {
  source?: AudioBufferSourceNode;
  gain: GainNode;
  buffer: AudioBuffer;
  startAtSeconds: number;
  endAtSeconds: number;
  positionSeconds: number;
  stopping: boolean;
  suppressHistory: boolean;
}

type Listener = (playbacks: ActivePlayback[]) => void;
type CacheListener = (loadedTrackIds: Set<string>) => void;
type HistoryListener = (progressByTrack: Map<string, number>) => void;
type RoutingListener = () => void;

const historyStorageKey = 'sonoriva-playback-history-v1';
const audioOutputStorageKey = 'sonoriva-audio-output-v1';

type AudioContextWithSink = AudioContext & {
  setSinkId: (sinkId: string) => Promise<void>;
};

type MediaDevicesWithOutputPicker = MediaDevices & {
  selectAudioOutput?: () => Promise<MediaDeviceInfo>;
};

class AudioEngine {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private masterVolume = 1;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer>>();
  private active = new Map<string, Set<Playback>>();
  private listeners = new Set<Listener>();
  private cacheListeners = new Set<CacheListener>();
  private historyListeners = new Set<HistoryListener>();
  private routingListeners = new Set<RoutingListener>();
  private history = readHistory();
  private playbackSequence = 0;
  private maxActivePlaybacks = 8;
  private pendingMainPlaybacks = 0;
  private outputSelection = readAudioOutputSelection();

  getPlaybackMode(): AudioPlaybackMode {
    return bridgeClient.getMode();
  }

  setPlaybackMode(mode: AudioPlaybackMode): void {
    if (mode === bridgeClient.getMode()) return;
    if (this.getActivePlaybacks().length > 0) throw new Error('Arrêtez les lectures en cours avant de changer de moteur audio.');
    bridgeClient.setMode(mode);
    this.setMasterVolume(this.masterVolume);
    this.notify();
    this.notifyCache();
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getMaxActivePlaybacks(): number {
    return this.maxActivePlaybacks;
  }

  setMaxActivePlaybacks(limit: number): void {
    this.maxActivePlaybacks = Math.min(16, Math.max(1, Math.round(limit)));
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.min(1, Math.max(0, volume));
    videoEngine.setMasterVolume(this.masterVolume);
    if (bridgeClient.isEnabled()) {
      bridgeClient.setMasterVolume(this.masterVolume);
      return;
    }
    if (!this.context || !this.masterGain) return;
    const now = this.context.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(this.masterVolume, now + .03);
  }

  supportsAudioOutputSelection(): boolean {
    return typeof AudioContext !== 'undefined'
      && typeof (AudioContext.prototype as Partial<AudioContextWithSink>).setSinkId === 'function';
  }

  supportsAudioOutputPicker(): boolean {
    if (typeof navigator === 'undefined') return false;
    return typeof (navigator.mediaDevices as MediaDevicesWithOutputPicker | undefined)?.selectAudioOutput === 'function';
  }

  getAudioOutputSelection(): AudioOutputSelection {
    return { ...this.outputSelection };
  }

  async listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
    if (!this.supportsAudioOutputSelection()) return [];
    if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.enumerateDevices !== 'function') {
      return [{ deviceId: '', label: 'Sortie système par défaut' }];
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((device) => device.kind === 'audiooutput' && device.deviceId !== 'default');
    return [
      { deviceId: '', label: 'Sortie système par défaut' },
      ...outputs.map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label.trim() || `Sortie audio ${index + 1}`,
      })),
    ];
  }

  async chooseAudioOutput(): Promise<AudioOutputSelection> {
    if (!this.supportsAudioOutputPicker()) throw new Error('Le sélecteur de sortie audio n’est pas disponible.');
    const device = await (navigator.mediaDevices as MediaDevicesWithOutputPicker).selectAudioOutput!();
    const selection = { deviceId: device.deviceId, label: device.label.trim() || 'Sortie audio sélectionnée' };
    await this.setAudioOutput(selection.deviceId, selection.label);
    return selection;
  }

  async setAudioOutput(deviceId: string, label = ''): Promise<void> {
    if (!this.supportsAudioOutputSelection()) throw new Error('La sélection de sortie audio n’est pas prise en charge par ce navigateur.');
    const context = await this.getContext();
    await (context as AudioContextWithSink).setSinkId(deviceId);
    this.outputSelection = {
      deviceId,
      label: deviceId ? label.trim() || 'Sortie audio sélectionnée' : 'Sortie système par défaut',
    };
    persistAudioOutputSelection(this.outputSelection);
    this.notifyRouting();
  }

  async applyAudioOutput(element: HTMLMediaElement, preferredOutputLabel?: string, systemDefault = false): Promise<void> {
    if (typeof element.setSinkId !== 'function') return;
    if (!preferredOutputLabel) {
      try {
        await element.setSinkId(this.outputSelection.deviceId);
      } catch {
        await element.setSinkId('');
      }
      return;
    }
    if (systemDefault) {
      await element.setSinkId('');
      return;
    }
    const devices = await this.listAudioOutputDevices();
    const selected = devices.find((device) => outputLabelsMatch(device.label, preferredOutputLabel));
    if (!selected || !selected.deviceId) {
      await element.setSinkId('');
      return;
    }
    try {
      await element.setSinkId(selected.deviceId);
    } catch {
      await element.setSinkId('');
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    const unsubscribeVideo = videoEngine.subscribe(() => this.notify());
    const unsubscribeBridge = bridgeClient.subscribe(() => {
      if (bridgeClient.isEnabled()) this.notify();
    });
    listener(this.getActivePlaybacks());
    return () => {
      this.listeners.delete(listener);
      unsubscribeBridge();
      unsubscribeVideo();
    };
  }

  subscribeCache(listener: CacheListener): () => void {
    this.cacheListeners.add(listener);
    const unsubscribeBridge = bridgeClient.subscribeCache(() => {
      if (bridgeClient.isEnabled()) this.notifyCache();
    });
    listener(bridgeClient.isEnabled() ? bridgeClient.getCachedTrackIds() : new Set(this.buffers.keys()));
    return () => {
      this.cacheListeners.delete(listener);
      unsubscribeBridge();
    };
  }

  subscribeHistory(listener: HistoryListener): () => void {
    this.historyListeners.add(listener);
    listener(new Map(this.history));
    return () => this.historyListeners.delete(listener);
  }

  subscribeRouting(listener: RoutingListener): () => void {
    this.routingListeners.add(listener);
    const unsubscribeBridge = bridgeClient.subscribeRouting(listener);
    return () => {
      this.routingListeners.delete(listener);
      unsubscribeBridge();
    };
  }

  resetHistory(trackIds?: string[]): void {
    if (trackIds) for (const trackId of trackIds) this.history.delete(trackId);
    else this.history.clear();
    this.persistHistory();
    this.notifyHistory();
  }

  persistActiveProgress(): void {
    if (bridgeClient.isEnabled()) {
      for (const playback of this.getActivePlaybacks()) this.recordProgress(playback, playbackPositionAt(playback) / playback.durationMs);
      return;
    }
    for (const instances of this.active.values()) {
      for (const playback of instances) this.recordProgress(playback, this.currentElapsedMs(playback) / playback.durationMs);
    }
  }

  private getActivePlaybacks(): ActivePlayback[] {
    return [...this.getAudioPlaybacks(), ...videoEngine.getPlaybacks()].sort((a, b) => a.startedAtMs - b.startedAtMs);
  }

  private getAudioPlaybacks(): ActivePlayback[] {
    if (bridgeClient.isEnabled()) {
      const now = performance.now();
      return bridgeClient.getPlaybacks().filter((playback) => playback.channel === 'main').map((playback) => ({
        id: playback.id,
        trackId: playback.trackId,
        sequence: playback.sequence,
        startedAtMs: now - playback.positionMs,
        resumedAtMs: now,
        elapsedMs: playback.positionMs,
        durationMs: playback.durationMs,
        loop: playback.loopPlayback,
        paused: playback.paused,
        volume: playback.volume,
        volumeFrom: playback.volume,
        volumeTransitionStartedAtMs: now,
        volumeTransitionDurationMs: 0,
        fadingOut: playback.fadingOut,
        outputId: playback.outputId,
      }));
    }
    return [...this.active.values()]
      .flatMap((instances) => [...instances])
      .map(({ id, trackId, sequence, startedAtMs, resumedAtMs, elapsedMs, durationMs, loop, paused, volume, volumeFrom, volumeTransitionStartedAtMs, volumeTransitionDurationMs, fadingOut }) => ({
        id, trackId, sequence, startedAtMs, resumedAtMs, elapsedMs, durationMs, loop, paused, volume,
        volumeFrom, volumeTransitionStartedAtMs, volumeTransitionDurationMs, fadingOut,
      }))
      .sort((a, b) => a.sequence - b.sequence);
  }

  private notify(): void {
    const playbacks = this.getActivePlaybacks();
    this.listeners.forEach((listener) => listener(playbacks));
  }

  private notifyCache(): void {
    const ids = bridgeClient.isEnabled() ? bridgeClient.getCachedTrackIds() : new Set(this.buffers.keys());
    this.cacheListeners.forEach((listener) => listener(ids));
  }

  private notifyHistory(): void {
    const history = new Map(this.history);
    this.historyListeners.forEach((listener) => listener(history));
  }

  private notifyRouting(): void {
    this.routingListeners.forEach((listener) => listener());
  }

  private recordProgress(playback: Pick<ActivePlayback, 'trackId'>, progress: number): void {
    const bounded = Math.min(1, Math.max(0, progress));
    if (bounded <= (this.history.get(playback.trackId) ?? 0)) return;
    this.history.set(playback.trackId, bounded);
    this.persistHistory();
    this.notifyHistory();
  }

  private persistHistory(): void {
    try {
      localStorage.setItem(historyStorageKey, JSON.stringify(Object.fromEntries(this.history)));
    } catch {
      // L'historique reste disponible pour la session si le stockage est indisponible.
    }
  }

  private async getContext(): Promise<AudioContext> {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.masterGain = this.context.createGain();
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.context.currentTime);
      this.masterGain.connect(this.context.destination);
      if (this.outputSelection.deviceId && typeof (this.context as Partial<AudioContextWithSink>).setSinkId === 'function') {
        try {
          await (this.context as AudioContextWithSink).setSinkId(this.outputSelection.deviceId);
        } catch {
          this.outputSelection = { deviceId: '', label: 'Sortie système par défaut' };
          persistAudioOutputSelection(this.outputSelection);
          this.notifyRouting();
        }
      }
    }
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

  private async load(track: Track): Promise<AudioBuffer> {
    const cached = this.buffers.get(track.id);
    if (cached) return cached;
    const existing = this.pending.get(track.id);
    if (existing) return existing;
    const loading = (async () => {
      try {
        const context = await this.getContext();
        const response = await fetchTrackAudio(track.id);
        if (!response.ok) throw new Error(`Impossible de charger « ${track.title} »`);
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(track.id, decoded);
        this.notifyCache();
        return decoded;
      } finally {
        this.pending.delete(track.id);
      }
    })();
    this.pending.set(track.id, loading);
    return loading;
  }

  async preload(track: Track): Promise<void> {
    if (isVideoTrack(track)) return;
    if (bridgeClient.isEnabled()) {
      try {
        return await bridgeClient.preload(track);
      } catch (cause) {
        if (!isBridgeUnavailableError(cause)) throw cause;
        bridgeClient.fallbackToBrowser();
      }
    }
    await this.load(track);
  }

  async play(track: Track, fadeInMs = track.fadeInMs, volumeMultiplier = 1, outputId?: string): Promise<string> {
    if (isVideoTrack(track)) {
      if (this.getAudioPlaybacks().length + this.pendingMainPlaybacks >= this.maxActivePlaybacks) {
        throw new Error(`Limite de ${this.maxActivePlaybacks} lectures simultanées atteinte.`);
      }
      return videoEngine.play(track, ++this.playbackSequence, fadeInMs, volumeMultiplier);
    }
    if (this.getActivePlaybacks().length + this.pendingMainPlaybacks >= this.maxActivePlaybacks) {
      throw new Error(`Limite de ${this.maxActivePlaybacks} lecture${this.maxActivePlaybacks > 1 ? 's' : ''} simultanée${this.maxActivePlaybacks > 1 ? 's' : ''} atteinte.`);
    }
    this.pendingMainPlaybacks += 1;
    try {
      if (bridgeClient.isEnabled()) {
        try {
          return await bridgeClient.play(track, fadeInMs, volumeMultiplier, 'main', outputId);
        } catch (cause) {
          if (!isBridgeUnavailableError(cause)) throw cause;
          bridgeClient.fallbackToBrowser();
        }
      }
      const [context, buffer] = await Promise.all([this.getContext(), this.load(track)]);
      const gain = context.createGain();
      const startAt = Math.min(track.startTimeMs / 1000, Math.max(0, buffer.duration - 0.01));
      const endAt = track.endTimeMs ? Math.min(track.endTimeMs / 1000, buffer.duration) : buffer.duration;
      const volume = Math.min(1, Math.max(0, track.volume * volumeMultiplier));
      gain.connect(this.masterGain ?? context.destination);
      const now = context.currentTime;
      if (fadeInMs > 0) {
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + fadeInMs / 1000);
      } else {
        gain.gain.setValueAtTime(volume, now);
      }
      const sequence = ++this.playbackSequence;
      const startedAtMs = performance.now();
      const playback: Playback = {
        id: `${track.id}:${sequence}`,
        trackId: track.id,
        sequence,
        startedAtMs,
        resumedAtMs: startedAtMs,
        elapsedMs: 0,
        durationMs: Math.max(10, (endAt - startAt) * 1_000),
        loop: track.loop,
        paused: false,
        volume,
        volumeFrom: fadeInMs > 0 ? 0 : volume,
        volumeTransitionStartedAtMs: startedAtMs,
        volumeTransitionDurationMs: Math.max(0, fadeInMs),
        fadingOut: false,
        gain,
        buffer,
        startAtSeconds: startAt,
        endAtSeconds: endAt,
        positionSeconds: startAt,
        stopping: false,
        suppressHistory: false,
      };
      const instances = this.active.get(track.id) ?? new Set<Playback>();
      instances.add(playback);
      this.active.set(track.id, instances);
      this.startPlaybackSource(playback);
      this.notify();
      return playback.id;
    } finally {
      this.pendingMainPlaybacks = Math.max(0, this.pendingMainPlaybacks - 1);
    }
  }

  togglePauseInstance(playbackId: string): void {
    if (videoEngine.owns(playbackId)) return videoEngine.togglePause();
    if (bridgeClient.isEnabled()) return bridgeClient.togglePause(playbackId);
    const playback = this.findPlayback(playbackId);
    if (!playback || playback.stopping) return;
    if (playback.paused) {
      playback.paused = false;
      if (!playback.loop && playback.positionSeconds >= playback.endAtSeconds - 0.005) {
        this.finishPlayback(playback, true);
        return;
      }
      this.startPlaybackSource(playback);
    } else {
      this.capturePosition(playback);
      playback.paused = true;
    }
    this.notify();
  }

  setInstanceVolume(playbackId: string, volume: number): void {
    if (videoEngine.owns(playbackId)) return videoEngine.setVolume(volume);
    if (bridgeClient.isEnabled()) return bridgeClient.setVolume(playbackId, volume);
    const playback = this.findPlayback(playbackId);
    const context = this.context;
    if (!playback || !context || playback.stopping) return;
    const nextVolume = Math.min(1, Math.max(0, volume));
    const now = context.currentTime;
    const nowMs = performance.now();
    const currentVolume = playbackVolumeAt(playback, nowMs);
    playback.gain.gain.cancelScheduledValues(now);
    playback.gain.gain.setValueAtTime(currentVolume, now);
    playback.gain.gain.linearRampToValueAtTime(nextVolume, now + .03);
    playback.volume = nextVolume;
    playback.volumeFrom = currentVolume;
    playback.volumeTransitionStartedAtMs = nowMs;
    playback.volumeTransitionDurationMs = 30;
    this.notify();
  }

  setInstanceLoop(playbackId: string, loop: boolean): void {
    if (videoEngine.owns(playbackId)) return videoEngine.setLoop(loop);
    if (bridgeClient.isEnabled()) return bridgeClient.setLoop(playbackId, loop);
    const playback = this.findPlayback(playbackId);
    if (!playback || playback.stopping || playback.loop === loop) return;
    if (!playback.paused) this.capturePosition(playback, true);
    if (playback.loop && !loop) {
      playback.elapsedMs = Math.max(0, playback.positionSeconds - playback.startAtSeconds) * 1_000;
    }
    playback.loop = loop;
    if (!playback.paused) this.startPlaybackSource(playback);
    this.notify();
  }

  seekInstance(playbackId: string, progress: number): void {
    if (videoEngine.owns(playbackId)) return videoEngine.seek(progress);
    if (bridgeClient.isEnabled()) return bridgeClient.seek(playbackId, progress);
    const playback = this.findPlayback(playbackId);
    if (!playback || playback.stopping) return;
    const boundedProgress = Math.min(1, Math.max(0, progress));
    const wasPaused = playback.paused;
    if (!wasPaused) this.capturePosition(playback, true);
    const playableSeconds = Math.max(.01, playback.endAtSeconds - playback.startAtSeconds);
    const sourceProgress = playback.loop ? Math.min(.999_999, boundedProgress) : boundedProgress;
    playback.positionSeconds = playback.startAtSeconds + playableSeconds * sourceProgress;
    playback.elapsedMs = playback.durationMs * sourceProgress;
    playback.resumedAtMs = performance.now();
    if (!wasPaused) {
      if (!playback.loop && boundedProgress >= 1) {
        this.finishPlayback(playback, true);
        return;
      }
      this.startPlaybackSource(playback);
    }
    this.notify();
  }

  async setInstanceOutput(playbackId: string, outputId: string): Promise<void> {
    if (videoEngine.owns(playbackId)) throw new Error('Le son de la vidéo utilise la sortie système du navigateur.');
    if (!bridgeClient.isEnabled()) throw new Error('Le changement de sortie en cours de lecture nécessite SonoRiva Bridge.');
    await bridgeClient.setPlaybackOutput(playbackId, outputId);
  }

  stop(trackId: string, fadeOutMs = 250): void {
    if (videoEngine.getState().trackId === trackId) videoEngine.stop(fadeOutMs);
    if (bridgeClient.isEnabled()) return bridgeClient.stopTrack(trackId, fadeOutMs);
    const context = this.context;
    const instances = this.active.get(trackId);
    if (!context || !instances) return;
    for (const playback of instances) this.stopPlayback(playback, fadeOutMs);
  }

  stopInstance(playbackId: string, fadeOutMs = 250): void {
    if (videoEngine.owns(playbackId)) return videoEngine.stop(fadeOutMs);
    if (bridgeClient.isEnabled()) return bridgeClient.stop(playbackId, fadeOutMs);
    const playback = this.findPlayback(playbackId);
    if (playback) this.stopPlayback(playback, fadeOutMs);
  }

  private stopPlayback(playback: Playback, fadeOutMs: number): void {
    const context = this.context;
    if (!context) return;
    if (playback.stopping) {
      if (fadeOutMs <= 0) {
        const now = context.currentTime;
        playback.gain.gain.cancelScheduledValues(now);
        playback.gain.gain.setValueAtTime(0, now);
        if (playback.source) playback.source.stop(now);
        else this.finishPlayback(playback, false);
      }
      return;
    }
    const elapsedMs = this.currentElapsedMs(playback);
    const nowMs = performance.now();
    const currentVolume = playbackVolumeAt(playback, nowMs);
    playback.elapsedMs = elapsedMs;
    playback.resumedAtMs = nowMs;
    if (!playback.suppressHistory) this.recordProgress(playback, elapsedMs / playback.durationMs);
    playback.stopping = true;
    const { source, gain } = playback;
    if (!source || playback.paused) {
      this.finishPlayback(playback, false);
      return;
    }
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    if (fadeOutMs <= 0) {
      playback.volume = 0;
      playback.volumeFrom = 0;
      playback.volumeTransitionStartedAtMs = nowMs;
      playback.volumeTransitionDurationMs = 0;
      gain.gain.setValueAtTime(0, now);
      playback.source = undefined;
      source.onended = null;
      source.stop(now);
      this.finishPlayback(playback, false);
      return;
    }
    playback.volume = 0;
    playback.volumeFrom = currentVolume;
    playback.volumeTransitionStartedAtMs = nowMs;
    playback.volumeTransitionDurationMs = fadeOutMs;
    playback.fadingOut = true;
    gain.gain.setValueAtTime(currentVolume, now);
    gain.gain.linearRampToValueAtTime(0, now + fadeOutMs / 1000);
    source.stop(now + fadeOutMs / 1000 + 0.02);
    this.notify();
  }

  stopAll(tracks: Track[], fadeOutMs?: number): void {
    videoEngine.stop(0);
    if (bridgeClient.isEnabled()) {
      const fades = new Map(tracks.map((track) => [track.id, track.fadeOutMs]));
      for (const playback of bridgeClient.getPlaybacks()) {
        bridgeClient.stop(playback.id, fadeOutMs ?? fades.get(playback.trackId) ?? 250);
      }
      return;
    }
    for (const track of tracks) this.stop(track.id, fadeOutMs ?? track.fadeOutMs);
  }

  stopLast(tracks: Track[], immediate: boolean): void {
    const playbacks = this.getActivePlaybacks();
    const playback = immediate ? playbacks.at(-1) : [...playbacks].reverse().find((candidate) => !candidate.fadingOut);
    if (!playback) return;
    const track = tracks.find((candidate) => candidate.id === playback.trackId);
    const fadeOutMs = immediate ? 0 : track && track.fadeOutMs > 0 ? track.fadeOutMs : 1_200;
    this.stopInstance(playback.id, fadeOutMs);
  }

  resetProjectSession(tracks: Track[]): void {
    videoEngine.stop();
    if (bridgeClient.isEnabled()) {
      bridgeClient.stopAll(0);
      this.resetHistory(tracks.map((track) => track.id));
      return;
    }
    const trackIds = new Set(tracks.map((track) => track.id));
    for (const [trackId, instances] of this.active) {
      if (!trackIds.has(trackId)) continue;
      for (const playback of instances) playback.suppressHistory = true;
    }
    this.stopAll(tracks, 0);
    this.resetHistory([...trackIds]);
  }

  async runAction(action: MouseAction, track: Track, projectTracks: Track[], volumeMultiplier = 1, outputId?: string): Promise<void> {
    if (action === 'none') return;
    if (isVideoTrack(track)) {
      if (action === 'stop') this.stop(track.id, track.fadeOutMs);
      else await this.play(track, action === 'fade-in' ? track.fadeInMs || 1200 : track.fadeInMs, volumeMultiplier);
      return;
    }
    if (action === 'stop') return this.stop(track.id, track.fadeOutMs);
    if (action === 'start') { await this.play(track, track.fadeInMs, volumeMultiplier, outputId); return; }
    if (action === 'fade-in') { await this.play(track, track.fadeInMs > 0 ? track.fadeInMs : 1_200, volumeMultiplier, outputId); return; }
    await this.preload(track);
    if (action === 'replace') this.stopAll(projectTracks, 0);
    else this.stopAll(projectTracks);
    await this.play(track, track.fadeInMs, volumeMultiplier, outputId);
  }

  private findPlayback(playbackId: string): Playback | undefined {
    for (const instances of this.active.values()) {
      const playback = [...instances].find((candidate) => candidate.id === playbackId);
      if (playback) return playback;
    }
    return undefined;
  }

  private startPlaybackSource(playback: Playback): void {
    const context = this.context;
    if (!context) return;
    const source = context.createBufferSource();
    source.buffer = playback.buffer;
    source.loop = playback.loop;
    if (playback.loop) {
      source.loopStart = playback.startAtSeconds;
      source.loopEnd = Math.max(playback.startAtSeconds + .01, playback.endAtSeconds);
    }
    source.connect(playback.gain);
    playback.source = source;
    playback.resumedAtMs = performance.now();
    source.onended = () => {
      if (playback.source !== source) return;
      playback.source = undefined;
      this.finishPlayback(playback, !playback.stopping && !playback.loop);
    };
    if (playback.loop) source.start(0, playback.positionSeconds);
    else source.start(0, playback.positionSeconds, Math.max(.01, playback.endAtSeconds - playback.positionSeconds));
  }

  private capturePosition(playback: Playback, preserveVolumeTransition = false): void {
    const source = playback.source;
    if (!source) return;
    const nowMs = performance.now();
    const currentVolume = preserveVolumeTransition ? undefined : playbackVolumeAt(playback, nowMs);
    const elapsedSeconds = Math.max(0, nowMs - playback.resumedAtMs) / 1_000;
    playback.elapsedMs += elapsedSeconds * 1_000;
    if (playback.loop) {
      const length = Math.max(.01, playback.endAtSeconds - playback.startAtSeconds);
      playback.positionSeconds = playback.startAtSeconds
        + ((playback.positionSeconds - playback.startAtSeconds + elapsedSeconds) % length);
    } else {
      playback.positionSeconds = Math.min(playback.endAtSeconds, playback.positionSeconds + elapsedSeconds);
    }
    playback.resumedAtMs = nowMs;
    playback.source = undefined;
    source.onended = null;
    try { source.stop(); } catch { /* La source peut déjà être terminée. */ }
    const context = this.context;
    if (context && currentVolume !== undefined) {
      const now = context.currentTime;
      playback.gain.gain.cancelScheduledValues(now);
      playback.gain.gain.setValueAtTime(currentVolume, now);
    }
    if (currentVolume !== undefined) {
      playback.volume = currentVolume;
      playback.volumeFrom = currentVolume;
      playback.volumeTransitionStartedAtMs = nowMs;
      playback.volumeTransitionDurationMs = 0;
    }
  }

  private currentElapsedMs(playback: Playback): number {
    return playback.paused ? playback.elapsedMs : playback.elapsedMs + Math.max(0, performance.now() - playback.resumedAtMs);
  }

  private finishPlayback(playback: Playback, completed: boolean): void {
    if (!playback.suppressHistory) this.recordProgress(playback, completed ? 1 : this.currentElapsedMs(playback) / playback.durationMs);
    const instances = this.active.get(playback.trackId);
    instances?.delete(playback);
    if (!instances?.size) this.active.delete(playback.trackId);
    playback.source = undefined;
    playback.gain.disconnect();
    this.notify();
  }
}

export function playbackVolumeAt(playback: Pick<ActivePlayback, 'volume' | 'volumeFrom' | 'volumeTransitionStartedAtMs' | 'volumeTransitionDurationMs'>, atMs = performance.now()): number {
  if (playback.volumeTransitionDurationMs <= 0) return playback.volume;
  const progress = Math.min(1, Math.max(0, (atMs - playback.volumeTransitionStartedAtMs) / playback.volumeTransitionDurationMs));
  return playback.volumeFrom + (playback.volume - playback.volumeFrom) * progress;
}

function readHistory(): Map<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(historyStorageKey) ?? '{}') as Record<string, unknown>;
    return new Map(Object.entries(parsed).flatMap(([trackId, value]) => typeof value === 'number' && Number.isFinite(value)
      ? [[trackId, Math.min(1, Math.max(0, value))] as const]
      : []));
  } catch {
    return new Map();
  }
}

function readAudioOutputSelection(): AudioOutputSelection {
  try {
    const parsed = JSON.parse(localStorage.getItem(audioOutputStorageKey) ?? '{}') as Partial<AudioOutputSelection>;
    if (typeof parsed.deviceId === 'string') {
      return {
        deviceId: parsed.deviceId,
        label: typeof parsed.label === 'string' && parsed.label.trim()
          ? parsed.label.trim()
          : parsed.deviceId ? 'Sortie audio sélectionnée' : 'Sortie système par défaut',
      };
    }
  } catch {
    // La sortie système reste active si la préférence locale est illisible.
  }
  return { deviceId: '', label: 'Sortie système par défaut' };
}

function persistAudioOutputSelection(selection: AudioOutputSelection): void {
  try {
    if (selection.deviceId) localStorage.setItem(audioOutputStorageKey, JSON.stringify(selection));
    else localStorage.removeItem(audioOutputStorageKey);
  } catch {
    // La sélection reste active pour la session si le stockage est indisponible.
  }
}

function normalizeOutputLabel(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
    .replace(/\bhaut[ -]parleurs?\b/g, ' speakers ')
    .replace(/\becouteurs?\b/g, ' headphones ')
    .replace(/\bexterne?s?\b/g, ' external ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function outputLabelsMatch(candidate: string, requested: string): boolean {
  const candidateTokens = new Set(normalizeOutputLabel(candidate).split(' ').filter((token) => token && !['built', 'in', 'audio', 'output', 'sortie'].includes(token)));
  const requestedTokens = new Set(normalizeOutputLabel(requested).split(' ').filter((token) => token && !['built', 'in', 'audio', 'output', 'sortie'].includes(token)));
  if (candidateTokens.size === 0 || requestedTokens.size === 0) return false;
  return [...requestedTokens].every((token) => candidateTokens.has(token))
    || [...candidateTokens].every((token) => requestedTokens.has(token));
}

export const audioEngine = new AudioEngine();
