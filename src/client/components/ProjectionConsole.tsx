import { useEffect, useRef, useState } from 'react';
import { MonitorPlay, Pause, Play, Square, X } from 'lucide-react';
import { videoEngine } from '../lib/video-engine';

export function ProjectionConsole() {
  const [state, setState] = useState(() => videoEngine.getState());
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => videoEngine.subscribe(() => {
    setState(videoEngine.getState());
    const target = canvas.current;
    const context = target?.getContext('2d');
    const video = videoEngine.getElement();
    if (!target || !context) return;
    context.fillStyle = '#000'; context.fillRect(0, 0, target.width, target.height);
    if (video && video.readyState >= 2 && video.videoWidth && !videoEngine.getState().black && videoEngine.getState().title) {
      const scale = Math.min(target.width / video.videoWidth, target.height / video.videoHeight);
      const width = video.videoWidth * scale; const height = video.videoHeight * scale;
      context.drawImage(video, (target.width - width) / 2, (target.height - height) / 2, width, height);
    }
  }), []);
  return <section className="projection-console" aria-label="Projection vidéo">
    {state.connected && <canvas ref={canvas} width={320} height={180} aria-label="Aperçu de la projection" />}
    <div className="projection-copy"><strong><MonitorPlay size={17} /> Projection vidéo</strong><span>{state.connected ? state.title ?? 'Prête · écran noir' : 'Sortie déconnectée'}</span>{state.playback && <span>{Math.ceil(Math.max(0, state.playback.durationMs - state.playback.elapsedMs) / 1000)} s restantes</span>}<small>Son vidéo : sortie système du navigateur</small>{state.error && <p role="alert" className="form-error">{state.error}</p>}</div>
    <div className="projection-actions">
      <button className="button ghost" onClick={() => { try { videoEngine.open(); } catch (cause) { setState({ ...videoEngine.getState(), error: cause instanceof Error ? cause.message : 'Ouverture impossible.' }); } }}><MonitorPlay size={16} />{state.connected ? 'Voir la fenêtre' : 'Ouvrir la projection'}</button>
      {state.connected && <><button className="button ghost" disabled={!state.playback} onClick={() => videoEngine.togglePause()} aria-label={state.playback?.paused ? 'Reprendre la vidéo' : 'Pause vidéo'}>{state.playback?.paused ? <Play size={16} /> : <Pause size={16} />}</button><button className="button ghost" onClick={() => videoEngine.stop()} aria-label="Arrêter la vidéo"><Square size={16} /></button><button className={`button ${state.black ? 'primary' : 'ghost'}`} aria-pressed={state.black} onClick={() => videoEngine.toggleBlack()}>Noir écran</button><button className="button ghost" aria-label="Fermer la projection" onClick={() => videoEngine.close()}><X size={16} /></button></>}
    </div>
  </section>;
}
