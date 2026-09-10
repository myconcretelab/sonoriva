import { useEffect, useRef, useState } from 'react';
import { MonitorPlay, Pause, Play, Square, X } from 'lucide-react';
import { videoEngine } from '../lib/video-engine';

type Props = {
  panel?: boolean;
  onClose?: () => void;
  onExpand?: () => void;
  pending?: { title: string; run: () => Promise<unknown> };
  onPlayed?: () => void;
};

export function ProjectionConsole({ panel = false, onClose, onExpand, pending, onPlayed }: Props) {
  const [state, setState] = useState(() => videoEngine.getState());
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const heading = useRef<HTMLButtonElement>(null);
  const requestGeneration = useRef(0);
  useEffect(() => () => { requestGeneration.current++; }, [pending]);
  useEffect(() => videoEngine.subscribe(() => setState(videoEngine.getState())), []);
  useEffect(() => {
    if (!panel) return;
    const previous = document.activeElement;
    heading.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [panel]);
  useEffect(() => {
    const target = canvas.current;
    const context = target?.getContext('2d');
    if (!target || !context) return;
    const video = videoEngine.getElement();
    context.fillStyle = '#000'; context.fillRect(0, 0, target.width, target.height);
    if (video && video.readyState >= 2 && video.videoWidth && !state.black && state.title) {
      const scale = Math.min(target.width / video.videoWidth, target.height / video.videoHeight);
      const width = video.videoWidth * scale; const height = video.videoHeight * scale;
      context.drawImage(video, (target.width - width) / 2, (target.height - height) / 2, width, height);
    }
  }, [state, panel]);

  async function open() {
    const generation = requestGeneration.current;
    setError('');
    setOpening(true);
    try {
      videoEngine.open();
      if (pending) {
        await videoEngine.whenReady();
        if (generation !== requestGeneration.current) return;
        await pending.run();
        onPlayed?.();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ouverture impossible.'); }
    finally { setOpening(false); }
  }

  const controls = <div className="projection-actions">
    <button className="button ghost" disabled={!state.playback} onClick={() => videoEngine.togglePause()} aria-label={state.playback?.paused ? 'Reprendre la vidéo' : 'Pause vidéo'} title={state.playback?.paused ? 'Reprendre la vidéo' : 'Pause vidéo'}>{state.playback?.paused ? <Play size={16} /> : <Pause size={16} />}</button>
    <button className="button ghost" onClick={() => videoEngine.stop()} aria-label="Arrêter la vidéo" title="Arrêter la vidéo"><Square size={16} /></button>
    <button className={`button ${state.black ? 'primary' : 'ghost'}`} aria-pressed={state.black} onClick={() => videoEngine.toggleBlack()}>Noir écran</button>
  </div>;
  const remaining = state.playback ? `${Math.ceil(Math.max(0, state.playback.durationMs - state.playback.elapsedMs) / 1000)} s` : '';

  if (!panel) return state.connected || state.error ? <section className="projection-bar" aria-label="État de la projection">
    <button className="button ghost" onClick={onExpand}><MonitorPlay size={16} /><span>Projection</span></button>
    <span className="projection-bar-title" title={state.error || state.title}>{state.error || state.title || 'Prête · écran noir'}</span>
    {remaining && <span className="projection-remaining">{remaining}</span>}
    {state.connected && controls}
  </section> : null;

  return <aside className="projection-panel" aria-label="Commandes de projection vidéo" onKeyDown={(event) => { if (event.key === 'Escape') onClose?.(); }}>
    <header><strong><MonitorPlay size={17} />Projection vidéo</strong><button ref={heading} className="icon-button" onClick={onClose} aria-label="Replier les commandes vidéo" title="Replier les commandes vidéo"><X size={16} /></button></header>
    <canvas ref={canvas} width={640} height={360} aria-label="Aperçu de la projection" />
    <div className="projection-copy"><strong>{state.connected ? state.title ?? 'Prête · écran noir' : 'Projection fermée'}</strong>{remaining && <span>{remaining} restantes</span>}</div>
    {pending && <p className="projection-pending">Vidéo à lancer : <strong>{pending.title}</strong></p>}
    <button className="button ghost" disabled={opening} onClick={() => void open()}><MonitorPlay size={16} />{opening ? 'Ouverture…' : pending ? 'Ouvrir la projection et lire' : state.connected ? 'Voir la fenêtre' : 'Ouvrir la projection'}</button>
    {state.connected && <>{controls}<button className="button ghost" onClick={() => videoEngine.close()}><X size={16} />Fermer la projection</button></>}
    <small>Son vidéo : sortie système du navigateur</small>
    {(error || state.error) && <p role="alert" className="form-error">{error || state.error}</p>}
  </aside>;
}
