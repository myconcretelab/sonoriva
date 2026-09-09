import { useEffect, useRef, useState } from 'react';
import type { Track } from '../types';
import { trackStreamUrl } from '../lib/offline-audio';

export function VideoEditor({ track, startMs, endMs, onStartChange, onEndChange }: { track: Track; startMs: number; endMs: number | null; onStartChange: (value: number) => void; onEndChange: (value: number | null) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [dimensions, setDimensions] = useState('');
  useEffect(() => {
    const stop = () => ref.current?.pause();
    window.addEventListener('sonoriva:stop-temporary-audio', stop);
    return () => window.removeEventListener('sonoriva:stop-temporary-audio', stop);
  }, []);
  return <section className="video-editor"><strong>Prévisualisation privée</strong><video ref={ref} src={trackStreamUrl(track.id)} controls playsInline preload="metadata" onError={() => setError('Cette vidéo ne peut pas être lue dans ce navigateur.')} onLoadedMetadata={(event) => { const video = event.currentTarget; setDimensions(`${video.videoWidth} × ${video.videoHeight}`); video.currentTime = startMs / 1000; }} onTimeUpdate={(event) => {
    const video = event.currentTarget;
    if (endMs && video.currentTime >= endMs / 1000 && !video.paused) video.pause();
  }} /><small>{dimensions} · Cet aperçu ne modifie pas la projection.</small>
    <div className="field-row"><label>Entrée (secondes)<input type="number" min="0" step="0.01" value={startMs / 1000} onChange={(event) => onStartChange(Math.round(Number(event.target.value) * 1000))} /></label><label>Sortie (secondes)<input type="number" min={(startMs + 1) / 1000} step="0.01" value={endMs === null ? '' : endMs / 1000} placeholder="Fin du fichier" onChange={(event) => onEndChange(event.target.value === '' ? null : Math.round(Number(event.target.value) * 1000))} /></label></div>
    <label>À la fin<select name="videoEndBehavior" defaultValue={track.videoEndBehavior ?? 'black'}><option value="black">Écran noir</option><option value="hold">Conserver la dernière image</option></select></label><p>Volume à 0 % : vidéo muette. Les fondus agissent sur l’image et le son. La boucle reprend au point d’entrée.</p>{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
