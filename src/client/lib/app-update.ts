import { desktopHost, desktopRequest, persistDesktopProfile } from './desktop';
type UpdateListener = (available: boolean) => void;

let nativePending = false;
let waitingWorker: ServiceWorker | null = null;
let reloadRequested = false;
const listeners = new Set<UpdateListener>();

export async function registerAppServiceWorker(version: string): Promise<void> {
  if (desktopHost()) {
    const check = async () => {
      const status = await desktopRequest<{ pending?: string }>('/v1/desktop/interface/check', { method: 'POST' });
      nativePending = Boolean(status.pending);
      for (const listener of listeners) listener(nativePending);
    };
    void check().catch(() => undefined);
    window.setInterval(() => { void check().catch(() => undefined); }, 60 * 60 * 1000);
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(version)}`);
  if (registration.waiting && navigator.serviceWorker.controller) setWaitingWorker(registration.waiting);

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaitingWorker(worker);
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) window.location.reload();
  });

  const checkForUpdate = () => registration.update().catch(() => undefined);
  window.setInterval(checkForUpdate, 60 * 60 * 1_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}

export function subscribeToAppUpdate(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(nativePending || waitingWorker !== null);
  return () => listeners.delete(listener);
}

export function applyAppUpdate(): boolean {
  if (desktopHost() && nativePending) {
    void persistDesktopProfile().then(() => desktopRequest<{ revision: string }>('/v1/desktop/interface/activate', { method: 'POST' })).then(({ revision }) => { window.location.href = `/app/${revision}/`; }).catch((cause) => { window.alert(cause instanceof Error ? cause.message : 'Mise à jour impossible.'); });
    return true;
  }
  if (!waitingWorker) return false;
  reloadRequested = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

function setWaitingWorker(worker: ServiceWorker): void {
  waitingWorker = worker;
  for (const listener of listeners) listener(true);
}
