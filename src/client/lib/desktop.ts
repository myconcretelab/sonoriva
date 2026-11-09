/** The native host supplies this descriptor only to its own local console window. */
export interface DesktopHost { baseUrl?: string; token: string; userId: string; deviceId: string }
declare global { interface Window { readonly __SONORIVA_DESKTOP__?: DesktopHost } }
export function desktopHost(): DesktopHost | undefined { return typeof window === 'undefined' ? undefined : window.__SONORIVA_DESKTOP__; }
export const desktopBaseUrl = desktopHost()?.baseUrl ?? 'http://127.0.0.1:43821';

export class DesktopError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function desktopRequest<T>(path: string, init: RequestInit = {}, token = desktopHost()?.token): Promise<T> {
  if (!token) throw new Error('La connexion à la régie locale est absente.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const response = await fetch(`${desktopBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) throw new DesktopError((await response.json().catch(() => ({}))).error ?? 'Enregistrement sur le Bridge impossible.', response.status);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export function desktopProfile(): Record<string, string> {
  return Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith('sonoriva-') && !key.includes('bridge-association') && !key.includes('audio-mode')).map((key) => [key, localStorage.getItem(key)!]));
}
export async function persistDesktopProfile(): Promise<void> {
  if (desktopHost()) await desktopRequest('/v1/desktop/profile', { method: 'PUT', body: JSON.stringify(desktopProfile()) });
}
export async function initializeDesktop(): Promise<void> {
  if (!desktopHost()) return;
  const { profile, userId } = await desktopRequest<{ profile: Record<string, string>; userId: string }>('/v1/desktop/bootstrap');
  if (userId !== desktopHost()!.userId) throw new Error('Le compte associé au Bridge a changé. Rouvrez la régie locale.');
  // Native files are authoritative; WebView storage may have been cleared independently.
  for (const key of Object.keys(localStorage)) if (key.startsWith('sonoriva-')) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(profile)) localStorage.setItem(key, value);
  if (!profile['sonoriva-user']) {
    const identity = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${desktopHost()!.token}` } });
    if (!identity.ok) throw new Error('Ouvrez SonoRiva dans votre navigateur et préparez un spectacle avec ce Bridge pour activer la régie locale.');
    const { user } = await identity.json();
    localStorage.setItem('sonoriva-user', JSON.stringify(user));
    await persistDesktopProfile();
  }
  let last = JSON.stringify(desktopProfile());
  let saving = false;
  const persist = async () => {
    if (saving) return;
    const next = JSON.stringify(desktopProfile());
    if (next === last) return;
    saving = true;
    try { await persistDesktopProfile(); last = next; }
    catch { /* Workspace edits use their own awaited transaction and report failures directly. */ }
    finally { saving = false; }
  };
  window.setInterval(() => { void persist(); }, 1000);
  window.addEventListener('pagehide', () => { void persist(); });
}
