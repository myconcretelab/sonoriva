export async function readAudioFileDurationMs(file: File): Promise<number | undefined> {
  const objectUrl = URL.createObjectURL(file);
  const audio = document.createElement(/\.(mp4|webm)$/i.test(file.name) || file.type.startsWith('video/') ? 'video' : 'audio');
  audio.preload = 'metadata';
  try {
    return await new Promise<number | undefined>((resolve) => {
      let settled = false;
      const timeout = window.setTimeout(() => finish(undefined), 10_000);
      const finish = (durationMs: number | undefined) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        audio.removeAttribute('src');
        audio.load();
        resolve(durationMs);
      };
      audio.addEventListener('loadedmetadata', () => {
        finish(durationSecondsToMs(audio.duration));
      }, { once: true });
      audio.addEventListener('error', () => finish(undefined), { once: true });
      audio.src = objectUrl;
      audio.load();
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function durationSecondsToMs(durationSeconds: number): number | undefined {
  const durationMs = Math.round(durationSeconds * 1_000);
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : undefined;
}
