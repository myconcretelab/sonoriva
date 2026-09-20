import { getDownloadProgress, setDownloadProgress } from './download-state';
import type { Track } from '../types';

export type AudioPlaybackMode = 'browser' | 'bridge';

export interface BridgeStatus {
  version: string;
  paired: boolean;
  serverUrl: string | null;
  deviceId: string | null;
  cachedTracks: number;
  cachedBytes?: number;
  capabilities?: string[];
}

export interface BridgeOutput {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface BridgePlayback {
  id: string;
  trackId: string;
  sequence: number;
  positionMs: number;
  durationMs: number;
  loopPlayback: boolean;
  paused: boolean;
  volume: number;
  fadingOut: boolean;
  channel: 'main' | 'preview';
  outputId?: string;
}

interface BridgeAssociation {
  deviceId: string;
  localToken: string;
}

type PlaybackListener = (playbacks: BridgePlayback[]) => void;
type CacheListener = (trackIds: Set<string>) => void;
type RoutingListener = () => void;

const bridgeBaseUrl = 'http://127.0.0.1:43821';
const associationStorageKey = 'sonoriva-bridge-association-v1';
const modeStorageKey = 'sonoriva-audio-mode-v1';

export class BridgeUnavailableError extends Error {
  constructor() {
    super('SonoRiva Bridge est arrêté. Le mode Web Audio a été activé.');
    this.name = 'BridgeUnavailableError';
  }
}

export function isBridgeUnavailableError(cause: unknown): cause is BridgeUnavailableError {
  return cause instanceof BridgeUnavailableError;
}

export class BridgeClient {
  private association = readAssociation();
  private mode: AudioPlaybackMode = readMode();
  private playbacks: BridgePlayback[] = [];
  private cachedTrackIds = new Set<string>();
  private playbackListeners = new Set<PlaybackListener>();
  private cacheListeners = new Set<CacheListener>();
  private routingListeners = new Set<RoutingListener>();
  private polling?: number;
  private cachePolling?: ReturnType<typeof setInterval>;
  private cacheRefreshing = false;
  private knownTrackSizes = new Map<string, number>();
  private pendingPreloads = new Map<string, Promise<void>>();
  private socket?: WebSocket;

  getMode(): AudioPlaybackMode { return this.mode; }
  isEnabled(): boolean { return this.mode === 'bridge' && Boolean(this.association); }
  isAssociated(): boolean { return Boolean(this.association); }
  getDeviceId(): string | null { return this.association?.deviceId ?? null; }
  getPlaybacks(): BridgePlayback[] { return this.playbacks.map((playback) => ({ ...playback })); }
  getCachedTrackIds(): Set<string> { return new Set(this.cachedTrackIds); }

  setMode(mode: AudioPlaybackMode): void {
    if (mode === 'bridge' && !this.association) throw new Error('Associez d’abord SonoRiva Bridge à ce navigateur.');
    this.mode = mode;
    localStorage.setItem(modeStorageKey, mode);
    if (mode === 'bridge') this.startPolling();
    else this.stopPolling();
    this.notifyPlaybacks();
    this.notifyCache();
    this.notifyRouting();
  }

  fallbackToBrowser(): boolean {
    if (!this.isEnabled()) return false;
    this.stopPolling();
    this.mode = 'browser';
    this.playbacks = [];
    this.cachedTrackIds.clear();
    localStorage.setItem(modeStorageKey, 'browser');
    this.notifyPlaybacks();
    this.notifyCache();
    this.notifyRouting();
    return true;
  }

  saveAssociation(deviceId: string, localToken: string): void {
    this.association = { deviceId, localToken };
    localStorage.setItem(associationStorageKey, JSON.stringify(this.association));
    this.notifyRouting();
  }

  forgetAssociation(): void {
    this.stopPolling();
    this.association = undefined;
    this.mode = 'browser';
    this.playbacks = [];
    this.cachedTrackIds.clear();
    localStorage.removeItem(associationStorageKey);
    localStorage.setItem(modeStorageKey, 'browser');
    this.notifyPlaybacks();
    this.notifyCache();
    this.notifyRouting();
  }

  async discover(signal?: AbortSignal): Promise<BridgeStatus> {
    return this.request<BridgeStatus>('/v1/status', { signal }, false);
  }

  async outputs(): Promise<{ outputs: BridgeOutput[]; mainOutputId: string; previewOutputId: string }> {
    return this.request('/v1/outputs');
  }

  async setOutput(channel: 'main' | 'preview', deviceId: string): Promise<void> {
    await this.request(`/v1/outputs/${channel}`, { method: 'PUT', body: JSON.stringify({ deviceId }) });
    this.notifyRouting();
  }

  async syncProject(projectId: string): Promise<number> {
    const result = await this.request<{ cached: number }>(`/v1/projects/${encodeURIComponent(projectId)}/sync`, { method: 'POST' });
    return result.cached;
  }

  setCacheTracks(tracks: Track[]): void {
    this.knownTrackSizes = new Map(tracks.map((track) => [track.id, track.sizeBytes]));
    void this.refreshCache().catch(() => undefined);
  }

  async refreshCache(): Promise<void> {
    if (!this.isEnabled() || this.cacheRefreshing) return;
    this.cacheRefreshing = true;
    try {
      const result = await this.request<{ tracks: Record<string, number>; downloads: Record<string, [number, number]> }>('/v1/cache', { signal: AbortSignal.timeout(3000) });
      if (!this.isEnabled()) return;
      this.cachedTrackIds = new Set(Object.entries(result.tracks).filter(([id, size]) => !this.knownTrackSizes.has(id) || this.knownTrackSizes.get(id) === size).map(([id]) => id));
      for (const id of getDownloadProgress('bridge').keys()) {
        if (!result.downloads[id] && !this.pendingPreloads.has(id)) setDownloadProgress('bridge', id);
      }
      for (const [id, [received, total]] of Object.entries(result.downloads)) setDownloadProgress('bridge', id, { received, total });
      this.notifyCache();
    } finally { this.cacheRefreshing = false; }
  }

  async preload(track: Track): Promise<void> {
    this.knownTrackSizes.set(track.id, track.sizeBytes);
    const existing = this.pendingPreloads.get(track.id);
    if (existing) return existing;
    setDownloadProgress('bridge', track.id, { received: 0, total: track.sizeBytes });
    const loading = (async () => {
      try {
        await this.request('/v1/cache', { method: 'POST', body: JSON.stringify(track), signal: AbortSignal.timeout(300_000) });
        this.cachedTrackIds.add(track.id);
        this.notifyCache();
      } finally {
        this.pendingPreloads.delete(track.id);
        setDownloadProgress('bridge', track.id);
      }
    })();
    this.pendingPreloads.set(track.id, loading);
    return loading;
  }

  async play(track: Track, fadeInMs: number, volumeMultiplier: number, channel: 'main' | 'preview' = 'main', outputId?: string, signal?: AbortSignal, expiresAtMs = Date.now() + 10_000, remotePreview?: { id: number; url: string }): Promise<string> {
    // Older bridges cannot guarantee that an abandoned HTTP request will not start later.
    const status = await this.discover(signal ?? AbortSignal.timeout(3000));
    if (!status.capabilities?.includes('safePlayback')) throw new Error('Mettez SonoRiva Bridge à jour pour activer les lancements protégés et le suivi du cache.');
    signal?.throwIfAborted();
    this.knownTrackSizes.set(track.id, track.sizeBytes);
    const requestId = crypto.randomUUID();
    const launchSignal = signal ?? AbortSignal.timeout(10_000);
    const cancel = () => { void this.request(`/v1/cancel-launch/${requestId}`, { method: 'POST', signal: AbortSignal.timeout(3000) }).catch(() => undefined); };
    launchSignal.addEventListener('abort', cancel, { once: true });
    try {
      launchSignal.throwIfAborted();
      const result = await this.request<{ playbackId: string }>('/v1/play', {
        method: 'POST', signal: launchSignal,
        body: JSON.stringify({ track, fadeInMs, volumeMultiplier, channel, outputId, expiresAtMs, requestId, remotePreview }),
      });
      if (!remotePreview) {
        this.cachedTrackIds.add(track.id);
        this.notifyCache();
      }
      void this.refreshPlaybacks().catch(() => undefined);
      return result.playbackId;
    } catch (cause) {
      cancel();
      // A lost reply is not proof that playback failed: never replay it in another engine.
      if (isBridgeUnavailableError(cause)) throw new Error('Confirmation du lancement perdue. La demande a été annulée.');
      throw cause;
    } finally { launchSignal.removeEventListener('abort', cancel); }
  }

  async playRemotePreview(input: { id: string | number; name: string; url: string; durationMs: number; volume: number }, outputId?: string): Promise<string> {
    const previewId = String(input.id);
    const bridgePreviewId = remotePreviewBridgeId(previewId);
    const track = {
      id: `openverse-${previewId}`,
      projectId: '',
      categoryId: null,
      subcategoryId: null,
      title: input.name,
      originalFilename: input.name,
      mimeType: 'audio/mpeg',
      sizeBytes: 0,
      durationMs: input.durationMs,
      startTimeMs: 0,
      endTimeMs: null,
      volume: input.volume,
      loop: false,
      fadeInMs: 0,
      fadeOutMs: 0,
      color: null,
      tags: [],
      description: null,
      copyrightText: null,
      sourceUrl: input.url,
      sourceId: `openverse:${previewId}`,
      position: 0,
      createdAt: new Date().toISOString(),
    } satisfies Track;
    return this.play(track, 0, 1, 'preview', outputId, undefined, Date.now() + 10_000, { id: bridgePreviewId, url: input.url });
  }

  togglePause(id: string): void { this.send(`/v1/playbacks/${encodeURIComponent(id)}/pause`, 'POST'); }
  setVolume(id: string, volume: number): void { this.send(`/v1/playbacks/${encodeURIComponent(id)}/volume`, 'PUT', { volume }); }
  setMasterVolume(volume: number): void { this.send('/v1/master-volume', 'PUT', { volume }); }
  setLoop(id: string, loop: boolean): void { this.send(`/v1/playbacks/${encodeURIComponent(id)}/loop`, 'PUT', { loop }); }
  seek(id: string, progress: number): void { this.send(`/v1/playbacks/${encodeURIComponent(id)}/seek`, 'PUT', { progress }); }
  async setPlaybackOutput(id: string, deviceId: string): Promise<void> {
    await this.request(`/v1/playbacks/${encodeURIComponent(id)}/output`, { method: 'PUT', body: JSON.stringify({ deviceId }) });
    await this.refreshPlaybacks();
  }
  stop(id: string, fadeOutMs: number): void { this.send(`/v1/playbacks/${encodeURIComponent(id)}/stop`, 'POST', { fadeOutMs }); }
  stopTrack(trackId: string, fadeOutMs: number): void { this.send('/v1/stop-track', 'POST', { trackId, fadeOutMs }); }
  stopAll(fadeOutMs: number): void { this.send('/v1/stop-all', 'POST', { fadeOutMs }); }

  subscribe(listener: PlaybackListener): () => void {
    this.playbackListeners.add(listener);
    listener(this.getPlaybacks());
    if (this.isEnabled()) this.startPolling();
    return () => {
      this.playbackListeners.delete(listener);
      if (!this.playbackListeners.size) this.stopPolling();
    };
  }

  subscribeCache(listener: CacheListener): () => void {
    this.cacheListeners.add(listener);
    listener(this.getCachedTrackIds());
    return () => this.cacheListeners.delete(listener);
  }

  subscribeRouting(listener: RoutingListener): () => void {
    this.routingListeners.add(listener);
    listener();
    return () => this.routingListeners.delete(listener);
  }

  private startPolling(): void {
    if (this.polling || this.socket || typeof window === 'undefined') return;
    if (!this.cachePolling) {
      void this.refreshCache().catch(() => undefined);
      this.cachePolling = setInterval(() => { void this.refreshCache().catch(() => undefined); }, 500);
    }
    if (typeof WebSocket !== 'undefined' && this.association) {
      try {
        const socket = new WebSocket('ws://127.0.0.1:43821/v1/events');
        this.socket = socket;
        socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'authenticate', token: this.association?.localToken })));
        socket.addEventListener('message', (event) => {
          try {
            const payload = JSON.parse(String(event.data)) as { type?: string; playbacks?: BridgePlayback[] };
            if (payload.type === 'playbacks' && Array.isArray(payload.playbacks)) {
              this.playbacks = payload.playbacks;
              this.notifyPlaybacks();
            }
          } catch { /* Un message local invalide est ignoré. */ }
        });
        const fallback = () => {
          if (this.socket !== socket) return;
          this.socket = undefined;
          if (this.isEnabled() && this.playbackListeners.size) this.startHttpPolling();
        };
        socket.addEventListener('error', fallback, { once: true });
        socket.addEventListener('close', fallback, { once: true });
        return;
      } catch {
        this.socket = undefined;
      }
    }
    this.startHttpPolling();
  }

  private startHttpPolling(): void {
    if (this.polling || typeof window === 'undefined') return;
    const refresh = () => this.refreshPlaybacks().catch((cause) => {
      if (isBridgeUnavailableError(cause)) this.fallbackToBrowser();
    });
    refresh();
    this.polling = window.setInterval(refresh, 250);
  }

  private stopPolling(): void {
    clearInterval(this.cachePolling);
    this.cachePolling = undefined;
    for (const id of getDownloadProgress('bridge').keys()) setDownloadProgress('bridge', id);
    if (this.socket) {
      const socket = this.socket;
      this.socket = undefined;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
    if (this.polling !== undefined) window.clearInterval(this.polling);
    this.polling = undefined;
  }

  private async refreshPlaybacks(): Promise<void> {
    if (!this.isEnabled()) return;
    const result = await this.request<{ playbacks: BridgePlayback[] }>('/v1/playbacks');
    this.playbacks = result.playbacks;
    this.notifyPlaybacks();
  }

  private send(path: string, method: 'POST' | 'PUT', body?: unknown): void {
    this.request(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
      .then(() => this.refreshPlaybacks())
      .catch(() => undefined);
  }

  private notifyPlaybacks(): void {
    const playbacks = this.getPlaybacks();
    this.playbackListeners.forEach((listener) => listener(playbacks));
  }

  private notifyCache(): void {
    const cached = this.getCachedTrackIds();
    this.cacheListeners.forEach((listener) => listener(cached));
  }

  private notifyRouting(): void {
    this.routingListeners.forEach((listener) => listener());
  }

  private async request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    if (authenticated && !this.association) throw new Error('SonoRiva Bridge n’est pas associé à ce navigateur.');
    let response: Response;
    try {
      response = await fetch(`${bridgeBaseUrl}${path}`, {
        ...init,
        headers: {
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(authenticated ? { Authorization: `Bearer ${this.association!.localToken}` } : {}),
          ...init.headers,
        },
      });
    } catch (cause) {
      if (init.signal?.aborted || ['AbortError', 'TimeoutError'].includes((cause as { name?: string })?.name ?? '')) throw cause;
      throw new BridgeUnavailableError();
    }
    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      let message = responseBody.trim();
      try {
        const body = JSON.parse(responseBody) as { error?: unknown };
        if (typeof body.error === 'string') message = body.error;
      } catch { /* Les anciennes versions du Bridge renvoient parfois du texte brut. */ }
      throw new Error(message || `SonoRiva Bridge a répondu avec le statut ${response.status}.`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}

export function remotePreviewBridgeId(id: string): number {
  const hexadecimal = id.replaceAll('-', '').slice(0, 13);
  if (/^[0-9a-f]{13}$/i.test(hexadecimal)) return Number.parseInt(hexadecimal, 16);
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) % 1_000_000_000;
  return hash;
}

function readAssociation(): BridgeAssociation | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(associationStorageKey) ?? '{}') as Partial<BridgeAssociation>;
    if (typeof parsed.deviceId === 'string' && typeof parsed.localToken === 'string') {
      return { deviceId: parsed.deviceId, localToken: parsed.localToken };
    }
  } catch { /* L’association pourra être recréée. */ }
  return undefined;
}

function readMode(): AudioPlaybackMode {
  try {
    return localStorage.getItem(modeStorageKey) === 'bridge' && readAssociation() ? 'bridge' : 'browser';
  } catch {
    return 'browser';
  }
}

export const bridgeClient = new BridgeClient();
