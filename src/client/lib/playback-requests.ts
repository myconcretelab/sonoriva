export const playbackStartTimeoutMs = 10_000;
export class PlaybackRequests {
  private pending = new Map<AbortController, string>();
  begin(trackId: string, expiresAtMs = Date.now() + playbackStartTimeoutMs, parentSignal?: AbortSignal) {
    const controller = new AbortController();
    this.pending.set(controller, trackId);
    const cancel = () => controller.abort(parentSignal?.reason ?? new Error('Lancement du son annulé.'));
    if (parentSignal?.aborted) cancel();
    else parentSignal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('Démarrage annulé après 10 secondes. Le son peut être préchargé puis relancé.')), Math.max(0, expiresAtMs - Date.now()));
    return {
      signal: controller.signal,
      expiresAtMs,
      wait: <T>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
        const abort = () => reject(controller.signal.reason);
        if (controller.signal.aborted) { work.catch(() => undefined); abort(); return; }
        controller.signal.addEventListener('abort', abort, { once: true });
        work.then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', abort));
      }),
      finish: () => { clearTimeout(timer); parentSignal?.removeEventListener('abort', cancel); this.pending.delete(controller); },
    };
  }
  cancel(trackId?: string, message = 'Lancement du son annulé.'): void {
    for (const [controller, id] of this.pending) {
      if (trackId === undefined || trackId === id) controller.abort(new Error(message));
    }
  }
}
