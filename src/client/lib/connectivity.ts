// Deliberately independent of navigator.onLine: LAN/loopback and Internet can differ.
export async function checkServerConnection(signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { cache: 'no-store', signal });
    return response.ok && (await response.json()).status === 'ok';
  } catch { return false; }
}
