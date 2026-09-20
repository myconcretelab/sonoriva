import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Focus, LoaderCircle, Pause, Play, RotateCcw, Square, ZoomIn, ZoomOut } from 'lucide-react';
import {
  clampEndMs,
  clampStartMs,
  formatWaveformTime,
  selectionViewport,
  waveformPosition,
  waveformTime,
  waveformWindow,
} from '../lib/waveform';
import { loadWaveformAudio } from '../lib/waveform-audio';
import { audioEngine } from '../lib/audio-engine';
import { bridgeClient } from '../lib/bridge-client';
import type { Track } from '../types';

interface Props {
  track: Track;
  startMs: number;
  endMs: number | null;
  onStartChange: (value: number) => void;
  onEndChange: (value: number | null) => void;
}

export function WaveformEditor({ track, startMs, endMs, onStartChange, onEndChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [audioUrl, setAudioUrl] = useState<string>();
  const [buffer, setBuffer] = useState<AudioBuffer>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);
  const [dragging, setDragging] = useState<'start' | 'end'>();
  const [previewing, setPreviewing] = useState(false);
  const [stopResetArmed, setStopResetArmed] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(startMs);
  const audioRef = useRef<HTMLAudioElement>(null);
  const bridgePreviewId = useRef<string | undefined>(undefined);
  const bridgePreviewStartMs = useRef(0);
  const dragRef = useRef<{ kind: 'start' | 'end'; pointerId: number; offsetPx: number } | undefined>(undefined);
  const boundsRef = useRef({ startMs, endMs, onStartChange, onEndChange });
  boundsRef.current = { startMs, endMs, onStartChange, onEndChange };
  const totalMs = Math.max(1, buffer ? Math.round(buffer.duration * 1_000) : track.durationMs ?? 1);
  const effectiveEndMs = endMs ?? totalMs;
  const view = useMemo(() => waveformWindow(totalMs, zoom, pan), [pan, totalMs, zoom]);
  const startPosition = waveformPosition(startMs, view);
  const endPosition = waveformPosition(effectiveEndMs, view);
  const playheadPosition = waveformPosition(playheadMs, view);
  const selectionLeft = Math.max(0, Math.min(1, startPosition));
  const selectionRight = Math.max(0, Math.min(1, endPosition));

  useEffect(() => {
    const controller = new AbortController();
    const context = new AudioContext();
    let objectUrl: string | undefined;
    setLoading(true); setError(''); setBuffer(undefined); setAudioUrl(undefined);
    loadWaveformAudio(track, controller.signal)
      .then((response) => {
        if (!response.ok) throw new Error('Chargement de la forme d’onde impossible.');
        return response.blob();
      })
      .then(async (blob) => {
        controller.signal.throwIfAborted();
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        controller.signal.throwIfAborted();
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
        return decoded;
      })
      .then((decoded) => {
        if (controller.signal.aborted) return;
        setBuffer(decoded);
        const duration = Math.round(decoded.duration * 1_000);
        const bounds = boundsRef.current;
        if (bounds.startMs >= duration) bounds.onStartChange(0);
        if (bounds.endMs !== null && bounds.endMs > duration) bounds.onEndChange(null);
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Analyse impossible.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); context.close().catch(() => undefined); };
  }, [track]);

  useEffect(() => bridgeClient.subscribe((playbacks) => {
    const id = bridgePreviewId.current;
    if (!id) return;
    const playback = playbacks.find((candidate) => candidate.id === id);
    if (!playback) {
      bridgePreviewId.current = undefined;
      setPreviewing(false);
      setPlayheadMs(effectiveEndMs);
      return;
    }
    setPreviewing(!playback.paused);
    setPlayheadMs(Math.min(effectiveEndMs, bridgePreviewStartMs.current + playback.positionMs));
  }), [effectiveEndMs]);

  useEffect(() => () => {
    if (bridgePreviewId.current) bridgeClient.stop(bridgePreviewId.current, 0);
  }, []);

  useEffect(() => {
    setPlayheadMs((current) => Math.min(effectiveEndMs, Math.max(startMs, current)));
  }, [effectiveEndMs, startMs]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const center = height / 2;
    context.strokeStyle = 'rgba(255,255,255,.08)';
    context.lineWidth = ratio;
    context.beginPath(); context.moveTo(0, center); context.lineTo(width, center); context.stroke();
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const firstSample = Math.floor(view.startMs / 1_000 * buffer.sampleRate);
    const lastSample = Math.min(buffer.length, Math.ceil(view.endMs / 1_000 * buffer.sampleRate));
    const samplesPerPixel = Math.max(1, (lastSample - firstSample) / width);
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#F3FAFE'); gradient.addColorStop(.5, '#DBEDF7'); gradient.addColorStop(1, '#384661');
    context.fillStyle = gradient;
    context.beginPath();
    for (let x = 0; x < width; x += 1) {
      const from = Math.floor(firstSample + x * samplesPerPixel);
      const to = Math.min(lastSample, Math.ceil(from + samplesPerPixel));
      const sampleStep = Math.max(1, Math.floor((to - from) / 128));
      let peak = 0;
      for (const channel of channels) {
        for (let sample = from; sample < to; sample += sampleStep) peak = Math.max(peak, Math.abs(channel[sample] ?? 0));
      }
      const amplitude = Math.max(ratio, peak * (center - 5 * ratio));
      context.rect(x, center - amplitude, 1, amplitude * 2);
    }
    context.fill();
  }, [buffer, view]);

  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [draw]);

  function setHandleFromPointer(kind: 'start' | 'end', clientX: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const time = waveformTime((clientX - rect.left) / rect.width, view);
    if (kind === 'start') onStartChange(clampStartMs(time, effectiveEndMs, totalMs));
    else onEndChange(clampEndMs(time, startMs, totalMs));
  }

  function beginDrag(kind: 'start' | 'end', event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault(); event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = { kind, pointerId: event.pointerId, offsetPx: event.clientX - (bounds.left + bounds.width / 2) };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(kind);
  }

  function continueDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || event.buttons === 0) return;
    setHandleFromPointer(drag.kind, event.clientX - drag.offsetPx);
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = undefined;
    setDragging(undefined);
  }

  function seekFromPointer(event: ReactMouseEvent<HTMLDivElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || loading || !buffer) return;
    const requestedMs = waveformTime((event.clientX - rect.left) / rect.width, view);
    const nextMs = Math.min(effectiveEndMs, Math.max(startMs, requestedMs));
    setStopResetArmed(false);
    setPlayheadMs(nextMs);
    const audio = audioRef.current;
    if (audio) audio.currentTime = nextMs / 1_000;
    if (bridgePreviewId.current) bridgeClient.seek(bridgePreviewId.current, (nextMs - startMs) / Math.max(1, effectiveEndMs - startMs));
  }

  function changeZoom(nextZoom: number) {
    const boundedZoom = Math.min(64, Math.max(1, nextZoom));
    const center = (view.startMs + view.endMs) / 2;
    const nextDuration = totalMs / boundedZoom;
    setZoom(boundedZoom);
    setPan(totalMs === nextDuration ? 0 : Math.min(1, Math.max(0, (center - nextDuration / 2) / (totalMs - nextDuration))));
  }

  function focusSelection() {
    const next = selectionViewport(totalMs, startMs, effectiveEndMs);
    setZoom(next.zoom); setPan(next.pan);
  }

  async function togglePreview() {
    if (bridgeClient.isEnabled()) {
      if (bridgePreviewId.current) {
        bridgeClient.togglePause(bridgePreviewId.current);
        return;
      }
      const nextMs = playheadMs >= effectiveEndMs - 1 ? startMs : Math.min(effectiveEndMs, Math.max(startMs, playheadMs));
      setPlayheadMs(nextMs);
      setStopResetArmed(false);
      try {
        bridgePreviewStartMs.current = startMs;
        bridgePreviewId.current = await bridgeClient.play({ ...track, startTimeMs: startMs, endTimeMs: effectiveEndMs, loop: false }, 0, 1, 'preview');
        if (nextMs > startMs) bridgeClient.seek(bridgePreviewId.current, (nextMs - startMs) / Math.max(1, effectiveEndMs - startMs));
        setPreviewing(true);
      } catch { setError('La préécoute ne peut pas démarrer sur la sortie audio du bridge.'); }
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (previewing) { audio.pause(); setPreviewing(false); return; }
    const nextMs = playheadMs >= effectiveEndMs - 1 ? startMs : Math.min(effectiveEndMs, Math.max(startMs, playheadMs));
    audio.currentTime = nextMs / 1_000;
    setPlayheadMs(nextMs);
    setStopResetArmed(false);
    try {
      await audioEngine.applyAudioOutput(audio);
      await audio.play();
      setPreviewing(true);
    } catch { setError('La préécoute ne peut pas démarrer sur la sortie audio sélectionnée.'); }
  }

  function stopPreview() {
    if (bridgePreviewId.current) {
      bridgeClient.stop(bridgePreviewId.current, 0);
      bridgePreviewId.current = undefined;
      setPreviewing(false);
      if (!stopResetArmed) { setStopResetArmed(true); return; }
      setPlayheadMs(startMs);
      setStopResetArmed(false);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPreviewing(false);
    if (!stopResetArmed) {
      setStopResetArmed(true);
      return;
    }
    audio.currentTime = startMs / 1_000;
    setPlayheadMs(startMs);
    setStopResetArmed(false);
  }

  return <section className="waveform-editor">
    <header><div><strong>Début, fin et lecture</strong><span>Cliquez pour déplacer la lecture, ou maintenez une poignée pour régler précisément « {track.title} ».</span></div><div className="waveform-tools"><button type="button" onClick={() => changeZoom(zoom / 1.6)} aria-label="Dézoomer"><ZoomOut size={16} /></button><input aria-label="Zoom de la forme d’onde" type="range" min="1" max="64" step=".25" value={zoom} onChange={(event) => changeZoom(Number(event.target.value))} /><button type="button" onClick={() => changeZoom(zoom * 1.6)} aria-label="Zoomer"><ZoomIn size={16} /></button><button type="button" onClick={focusSelection} title="Cadrer la sélection"><Focus size={16} /></button><em>{zoom.toFixed(zoom < 10 ? 1 : 0)}×</em></div></header>
    <div className={`waveform-stage ${dragging ? 'is-dragging' : ''}`} ref={stageRef} onClick={seekFromPointer}>
      <canvas ref={canvasRef} />
      {loading && <span className="waveform-loading"><LoaderCircle className="spin" size={20} />Analyse du son…</span>}
      {error && !buffer && <span className="waveform-loading error">{error}</span>}
      <div className="waveform-selection" style={{ left: `${selectionLeft * 100}%`, width: `${Math.max(0, selectionRight - selectionLeft) * 100}%` }} />
      {playheadPosition >= 0 && playheadPosition <= 1 && <div className="waveform-playhead" style={{ left: `${playheadPosition * 100}%` }} aria-hidden="true"><span>{formatWaveformTime(playheadMs)}</span></div>}
      {startPosition >= 0 && startPosition <= 1 && <button type="button" className="waveform-handle start" style={{ left: `${startPosition * 100}%` }} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => beginDrag('start', event)} onPointerMove={continueDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} aria-label="Déplacer le début"><i /><span>{formatWaveformTime(startMs)}</span></button>}
      {endPosition >= 0 && endPosition <= 1 && <button type="button" className="waveform-handle end" style={{ left: `${endPosition * 100}%` }} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => beginDrag('end', event)} onPointerMove={continueDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} aria-label="Déplacer la fin"><i /><span>{formatWaveformTime(effectiveEndMs)}</span></button>}
      <span className="waveform-window-time start">{formatWaveformTime(view.startMs)}</span><span className="waveform-window-time end">{formatWaveformTime(view.endMs)}</span>
    </div>
    {zoom > 1 && <label className="waveform-pan"><span>Position</span><input type="range" min="0" max="1" step=".001" value={pan} onChange={(event) => setPan(Number(event.target.value))} /></label>}
    <div className="waveform-values">
      <div className="waveform-preview-controls"><button type="button" className="waveform-preview" onClick={togglePreview}>{previewing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}{previewing ? 'Pause' : 'Écouter la sélection'}</button><button type="button" className={`waveform-stop ${stopResetArmed ? 'is-armed' : ''}`} onClick={stopPreview} aria-label={stopResetArmed ? 'Replacer la lecture au début sélectionné' : 'Arrêter la lecture'} title={stopResetArmed ? 'Cliquer à nouveau pour revenir au début' : 'Arrêter la lecture'}><Square size={15} fill="currentColor" /></button></div>
      <label><span>Début</span><input type="number" min="0" max={Math.max(0, effectiveEndMs / 1_000 - .001)} step=".001" value={(startMs / 1_000).toFixed(3)} onChange={(event) => onStartChange(clampStartMs(Number(event.target.value) * 1_000, effectiveEndMs, totalMs))} /><em>{formatWaveformTime(startMs)}</em><button type="button" onClick={() => onStartChange(0)} title="Réinitialiser le début"><RotateCcw size={14} /></button></label>
      <label><span>Fin</span><input type="number" min={(startMs + 1) / 1_000} max={totalMs / 1_000} step=".001" value={(effectiveEndMs / 1_000).toFixed(3)} onChange={(event) => onEndChange(clampEndMs(Number(event.target.value) * 1_000, startMs, totalMs))} /><em>{formatWaveformTime(effectiveEndMs)}</em><button type="button" onClick={() => onEndChange(null)} title="Utiliser la fin du fichier"><RotateCcw size={14} /></button></label>
    </div>
    <audio ref={audioRef} src={audioUrl} preload="metadata" onLoadedMetadata={(event) => { event.currentTarget.currentTime = playheadMs / 1_000; }} onTimeUpdate={(event) => { const currentMs = Math.min(totalMs, event.currentTarget.currentTime * 1_000); setPlayheadMs(currentMs); if (currentMs >= effectiveEndMs) { event.currentTarget.pause(); setPlayheadMs(effectiveEndMs); setPreviewing(false); setStopResetArmed(false); } }} onEnded={() => { setPlayheadMs(effectiveEndMs); setPreviewing(false); setStopResetArmed(false); }} />
  </section>;
}
