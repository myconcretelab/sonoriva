import type { Track } from '../types';
import type { ActivePlayback } from './audio-engine';
import { trackStreamUrl } from './offline-audio';

export function isVideoTrack(track: Pick<Track, 'mimeType'>): boolean {
  return track.mimeType?.startsWith('video/') ?? false;
}

export function videoBounds(track: Pick<Track, 'startTimeMs' | 'endTimeMs'>, duration: number): { start: number; end: number } {
  const end = Math.min(duration, (track.endTimeMs ?? duration * 1000) / 1000);
  const start = Math.max(0, track.startTimeMs / 1000);
  if (!Number.isFinite(end) || end <= start) throw new Error('Les points d’entrée et de sortie dépassent la durée de la vidéo.');
  return { start, end };
}

class VideoEngine {
  private projection?: Window;
  private video?: HTMLVideoElement;
  private playback?: ActivePlayback;
  private track?: Track;
  private start = 0;
  private end = 0;
  private generation = 0;
  private master = 1;
  private timer?: number;
  private playbackTimer?: number;
  private lastTickNotification = 0;
  private fade?: { from: number; to: number; start: number; duration: number; stop: boolean };
  private gain = 1;
  private listeners = new Set<() => void>();
  private black = false;
  private error = '';

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private notify() { this.listeners.forEach((listener) => listener()); }
  getState() { return { connected: Boolean(this.projection && !this.projection.closed), black: this.black, error: this.error, title: this.track?.title, trackId: this.track?.id, playback: this.playback }; }
  getPlaybacks(): ActivePlayback[] { return this.playback ? [{ ...this.playback }] : []; }
  owns(id: string) { return this.playback?.id === id; }
  getElement() { return this.video; }

  open() {
    if (this.projection && !this.projection.closed) { this.projection.focus(); return; }
    const popup = window.open('/projection.html', 'sonoriva-projection', 'popup,width=960,height=540');
    if (!popup) throw new Error('La fenêtre de projection est bloquée. Autorisez son ouverture dans le navigateur.');
    this.projection = popup;
    this.error = '';
    this.timer = window.setInterval(() => {
      if (popup.closed) { this.close(); this.error = 'Sortie vidéo déconnectée.'; this.notify(); return; }
      try {
        if (!this.video && popup.location.pathname === '/projection.html' && popup.document.readyState === 'complete') this.initialize(popup);
        this.tick();
      } catch { this.close(); this.error = 'La fenêtre de projection a changé de page.'; this.notify(); }
    }, 50);
    window.addEventListener('pagehide', () => popup.close(), { once: true });
    this.notify();
  }

  whenReady(): Promise<void> {
    if (this.video && this.getState().connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = (error?: string) => {
        window.clearTimeout(timeout);
        unsubscribe();
        if (error) reject(new Error(error)); else resolve();
      };
      const unsubscribe = this.subscribe(() => {
        if (!this.getState().connected) finish('La projection a été fermée avant la lecture.');
        else if (this.video) finish();
      });
      const timeout = window.setTimeout(() => finish('La fenêtre de projection ne répond pas.'), 10000);
    });
  }

  private initialize(popup: Window) {
    popup.document.title = 'SonoRiva — Projection';
    popup.document.body.replaceChildren();
    popup.document.body.style.cssText = 'margin:0;background:black;overflow:hidden;width:100vw;height:100vh';
    const video = popup.document.createElement('video');
    video.style.cssText = 'width:100%;height:100%;object-fit:contain;background:black';
    video.playsInline = true;
    video.preload = 'auto';
    popup.document.body.append(video);
    const activate = popup.document.createElement('button');
    activate.textContent = 'Activer la projection en plein écran';
    activate.style.cssText = 'position:absolute;inset:40% 20%;font:20px sans-serif;padding:20px';
    activate.onclick = () => {
      void popup.document.documentElement.requestFullscreen().then(() => activate.remove()).catch(() => {
        activate.textContent = 'Double-cliquez pour réessayer le plein écran';
      });
    };
    popup.document.body.append(activate);
    video.ondblclick = () => { void popup.document.documentElement.requestFullscreen().catch(() => undefined); };
    this.video = video;
    this.error = '';
    this.black = false;
    video.onended = () => this.finish();
    video.onerror = () => this.fail('Lecture vidéo impossible : format incompatible ou fichier inaccessible.');
    video.onwaiting = () => { if (this.playback) { this.playback.paused = true; this.notify(); } };
    video.onplaying = () => this.tick();
    video.ontimeupdate = () => this.tick();
    this.playbackTimer = popup.setInterval(() => this.tick(), 50);
    popup.addEventListener('pagehide', () => { if (this.projection === popup) this.close(); });
    this.notify();
  }

  async play(track: Track, sequence: number, fadeInMs: number, multiplier: number): Promise<string> {
    const video = this.video;
    if (!video || !this.projection || this.projection.closed) throw new Error('Ouvrez et activez la projection avant de lancer une vidéo.');
    this.stop();
    const generation = this.generation;
    this.track = track;
    this.error = '';
    this.notify();
    video.style.visibility = 'hidden';
    video.src = trackStreamUrl(track.id);
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { window.clearTimeout(timeout); video.removeEventListener('loadedmetadata', ready); video.removeEventListener('error', failed); };
        const ready = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error('Impossible de charger cette vidéo.')); };
        const timeout = window.setTimeout(failed, 15000);
        video.addEventListener('loadedmetadata', ready, { once: true });
        video.addEventListener('error', failed, { once: true });
        video.load();
      });
      if (generation !== this.generation) throw new Error('Lecture vidéo annulée.');
      const bounds = videoBounds(track, video.duration);
      this.start = bounds.start; this.end = bounds.end;
      video.currentTime = this.start;
      video.loop = false;
      this.gain = fadeInMs > 0 ? 0 : 1;
      const volume = Math.min(1, Math.max(0, track.volume * multiplier));
      video.volume = volume * this.master * this.gain;
      await video.play();
      if (generation !== this.generation) throw new Error('Lecture vidéo annulée.');
      const now = performance.now();
      this.playback = { id: `video:${track.id}:${sequence}`, trackId: track.id, sequence, startedAtMs: now, resumedAtMs: now, elapsedMs: 0, durationMs: (this.end - this.start) * 1000, loop: track.loop, paused: false, volume, volumeFrom: volume, volumeTransitionStartedAtMs: now, volumeTransitionDurationMs: 0, fadingOut: false };
      this.fade = fadeInMs > 0 ? { from: 0, to: 1, start: now, duration: fadeInMs, stop: false } : undefined;
      video.style.visibility = this.black ? 'hidden' : 'visible';
      this.notify();
      return this.playback.id;
    } catch (cause) {
      if (generation === this.generation) this.fail(cause instanceof Error ? cause.message : 'Lecture vidéo impossible.');
      throw cause;
    }
  }

  private tick() {
    const video = this.video; const playback = this.playback;
    if (!video || !playback) return;
    if (this.fade) {
      const progress = Math.min(1, (performance.now() - this.fade.start) / this.fade.duration);
      this.gain = this.fade.from + (this.fade.to - this.fade.from) * progress;
      if (progress >= 1) { const stop = this.fade.stop; this.fade = undefined; if (stop) { this.stop(); return; } }
    }
    video.volume = Math.min(1, playback.volume * this.master * this.gain);
    video.style.opacity = String(this.gain);
    if (video.currentTime >= this.end - .015) { this.finish(); return; }
    playback.elapsedMs = Math.max(0, (video.currentTime - this.start) * 1000);
    playback.resumedAtMs = performance.now();
    playback.paused = video.paused || video.readyState < 3;
    if (performance.now() - this.lastTickNotification > 150) {
      this.lastTickNotification = performance.now();
      this.notify();
    }
  }
  private finish() {
    if (!this.playback || !this.video) return;
    if (this.playback.loop && !this.playback.fadingOut) {
      this.video.currentTime = this.start;
      void this.video.play().catch(() => this.fail('Reprise de la vidéo refusée par le navigateur.'));
    } else if (this.track?.videoEndBehavior === 'hold' && !this.playback.fadingOut) {
      this.video.pause(); this.playback = undefined; this.fade = undefined; this.notify();
    } else this.stop();
  }
  stop(fadeMs = 0) {
    if (fadeMs > 0 && this.playback) {
      this.playback.fadingOut = true;
      this.fade = { from: this.gain, to: 0, start: performance.now(), duration: fadeMs, stop: true };
      this.notify(); return;
    }
    this.generation++;
    this.fade = undefined; this.playback = undefined; this.track = undefined;
    if (this.video) { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); this.video.style.visibility = 'hidden'; }
    this.notify();
  }
  togglePause() { if (!this.video || !this.playback) return; if (this.video.paused) void this.video.play().catch(() => this.fail('Reprise de la vidéo refusée.')); else this.video.pause(); this.tick(); }
  seek(progress: number) { if (this.video && this.playback) { this.video.currentTime = this.start + Math.min(.999999, Math.max(0, progress)) * (this.end - this.start); this.tick(); } }
  setVolume(volume: number) { if (this.playback) { this.playback.volume = Math.min(1, Math.max(0, volume)); this.tick(); } }
  setLoop(loop: boolean) { if (this.playback) { this.playback.loop = loop; this.notify(); } }
  setMasterVolume(volume: number) { this.master = volume; this.tick(); }
  toggleBlack() { this.black = !this.black; if (this.video) this.video.style.visibility = this.black || !this.track ? 'hidden' : 'visible'; this.notify(); }
  private fail(message: string) { this.stop(); this.error = message; this.notify(); }
  close() { this.stop(); window.clearInterval(this.timer); const popup = this.projection; popup?.clearInterval(this.playbackTimer); this.projection = undefined; this.video = undefined; popup?.close(); this.notify(); }
}
export const videoEngine = new VideoEngine();
