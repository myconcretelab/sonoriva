export interface AppOfflineStatus { ready: boolean; revision?: string }

export async function appOfflineStatus(): Promise<AppOfflineStatus> {
  if (import.meta.env.DEV) return { ready: true, revision: 'development' };
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return { ready: false };
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (result: AppOfflineStatus) => { window.clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(result); };
    const timer = window.setTimeout(() => finish({ ready: false }), 3_000);
    channel.port1.onmessage = (event: MessageEvent<AppOfflineStatus>) => finish({ ready: event.data.ready === true, revision: event.data.revision });
    worker.postMessage({ type: 'APP_SHELL_STATUS' }, [channel.port2]);
  });
}

export async function prepareAppOffline(): Promise<void> {
  if (import.meta.env.DEV) return;
  const status = await appOfflineStatus();
  if (!status.ready) throw new Error('L’application n’est pas encore entièrement téléchargée. Attendez la fin de son installation puis réessayez.');
  await navigator.storage?.persist?.().catch(() => false);
}
