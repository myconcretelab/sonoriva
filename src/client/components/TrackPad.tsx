import type { DownloadProgress } from '../lib/download-state';
import { VideoThumbnail } from './VideoThumbnail';
import { isVideoTrack } from '../lib/video-engine';
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Download, Video, AudioWaveform, CircleCheck, Infinity as InfinityIcon, MoreHorizontal, Play } from 'lucide-react';
import type { ActivePlayback } from '../lib/audio-engine';
import type { RoutedBridgeOutput } from '../lib/bridge-output-routing';
import { contrastColor } from '../lib/color-contrast';
import { mobileTrackDragActivated, type ClientPoint } from '../lib/mobile-track-reorder';
import type { Track } from '../types';

interface Props {
  track: Track;
  color: string;
  active: boolean;
  playbacks: ActivePlayback[];
  historyProgress: number;
  loaded: boolean;
  greyPlayed?: boolean;
  download?: DownloadProgress;
  dragEnabled: boolean;
  selectionMode: boolean;
  selected: boolean;
  dropTarget: boolean;
  dropLabel?: string;
  reorderPositionTarget?: 'before' | 'after';
  playlistPositionTarget?: 'before' | 'after';
  shortcut?: string;
  bridgeOutputs: RoutedBridgeOutput[];
  mainBridgeOutputId?: string;
  onPrimary: () => void;
  onOutputPlay: (outputId: string) => void;
  onSecondary: () => void;
  onEdit: () => void;
  onSelect: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  mobileDragEnabled?: boolean;
  mobileDragSource?: boolean;
  onMobileDragStart?: (point: ClientPoint) => void;
  onMobileDragMove?: (point: ClientPoint) => void;
  onMobileDragEnd?: (point: ClientPoint, cancelled: boolean) => void;
}

export function TrackPad({ track, color, active, playbacks, historyProgress, loaded, greyPlayed = false, download, dragEnabled, selectionMode, selected, dropTarget, dropLabel, reorderPositionTarget, playlistPositionTarget, shortcut, bridgeOutputs, mainBridgeOutputId, onPrimary, onOutputPlay, onSecondary, onEdit, onSelect, onDragStart, onDragOver, onDrop, onDragEnd, mobileDragEnabled = false, mobileDragSource = false, onMobileDragStart, onMobileDragMove, onMobileDragEnd }: Props) {
  const mainOutput = (isVideoTrack(track) ? [] : bridgeOutputs).find((output) => output.id === mainBridgeOutputId);
  const alternateOutputs = mainOutput ? bridgeOutputs.filter((output) => output.id !== mainOutput.id) : [];
  const pointerDrag = useRef<{ pointerId: number; start: ClientPoint; started: boolean } | undefined>(undefined);
  const suppressClick = useRef(false);
  const canDrag = dragEnabled && (!selectionMode || selected);

  function beginMobileDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!canDrag || !mobileDragEnabled || (!(selectionMode && selected) && !(event.target instanceof Element && event.target.closest('[data-track-drag-handle]')))) return;
    if (event.pointerType === 'mouse' || event.button !== 0) return;
    event.currentTarget.style.setProperty('-webkit-user-drag', 'none');
    pointerDrag.current = { pointerId: event.pointerId, start: { clientX: event.clientX, clientY: event.clientY }, started: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveMobileDrag(event: ReactPointerEvent<HTMLElement>) {
    const gesture = pointerDrag.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = { clientX: event.clientX, clientY: event.clientY };
    if (!gesture.started && !mobileTrackDragActivated(gesture.start, point)) return;
    event.preventDefault();
    if (!gesture.started) {
      gesture.started = true;
      suppressClick.current = true;
      onMobileDragStart?.(point);
    }
    onMobileDragMove?.(point);
  }

  function finishMobileDrag(event: ReactPointerEvent<HTMLElement>, cancelled: boolean) {
    const gesture = pointerDrag.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.style.removeProperty('-webkit-user-drag');
    pointerDrag.current = undefined;
    if (!gesture.started) return;
    event.preventDefault();
    suppressClick.current = true;
    onMobileDragEnd?.({ clientX: event.clientX, clientY: event.clientY }, cancelled);
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  }

  return <article className={`track-pad ${greyPlayed && historyProgress > 0 && !active ? 'is-played' : ''} ${track.backgroundImage ? 'has-background-image' : ''} ${active ? 'is-active' : ''} ${canDrag ? 'drag-enabled' : ''} ${selectionMode ? 'selection-enabled' : ''} ${selected ? 'is-selected' : ''} ${mobileDragEnabled ? 'mobile-drag-enabled' : ''} ${mobileDragSource ? 'mobile-drag-source' : ''} ${dropTarget ? 'is-drop-target group-drop-target' : ''} ${reorderPositionTarget ? `reorder-position-target drop-${reorderPositionTarget}` : ''} ${playlistPositionTarget ? `playlist-position-target drop-${playlistPositionTarget}` : ''}`}
    style={{ backgroundImage: track.backgroundImage ? `linear-gradient(#0009, #0009), url("${track.backgroundImage}")` : undefined, '--track-color': color, '--track-contrast': contrastColor(color) } as React.CSSProperties} draggable={canDrag && selectionMode && selected} data-track-id={track.id} data-played={historyProgress > 0 || undefined} data-drop-label={dropTarget ? dropLabel : undefined} onClick={() => selectionMode && onSelect()}
    onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }}
    onDragStart={(event) => {
      if (!canDrag || (!(selectionMode && selected) && !(event.target instanceof Element && event.target.closest('[data-track-drag-handle]')))) { event.preventDefault(); return; }
      suppressClick.current = true;
      if (event.target instanceof HTMLElement) event.dataTransfer.setDragImage(event.currentTarget, event.currentTarget.clientWidth / 2, event.currentTarget.clientHeight / 2);
      onDragStart(event);
    }} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={() => { onDragEnd(); window.setTimeout(() => { suppressClick.current = false; }, 0); }}
    onPointerDown={beginMobileDrag} onPointerMove={moveMobileDrag} onPointerUp={(event) => finishMobileDrag(event, false)} onPointerCancel={(event) => finishMobileDrag(event, true)}>
    {selectionMode && <span className="track-selection-indicator" aria-hidden="true">{selected && <CircleCheck size={18} />}</span>}
    <button className="icon-button subtle track-edit" onClick={() => !selectionMode && onEdit()} aria-label={`Modifier ${track.title}`} tabIndex={selectionMode ? -1 : undefined}><MoreHorizontal size={18} /></button>
    <button className="track-trigger" onClick={() => !selectionMode && onPrimary()} onContextMenu={(event) => { event.preventDefault(); if (!selectionMode) onSecondary(); }} aria-pressed={selectionMode ? selected : undefined}>
      <span className={`play-disc ${mainOutput ? 'has-output-route' : ''}`} style={mainOutput ? { '--main-output-color': mainOutput.color } as React.CSSProperties : undefined}>{isVideoTrack(track) ? <Video size={18} /> : active ? <AudioWaveform size={18} /> : <Play size={18} fill="currentColor" />}</span>
      {isVideoTrack(track) && <VideoThumbnail trackId={track.id} />}
      <span className="track-title" title={track.title}>{track.title}</span>
    </button>
    {alternateOutputs.length > 0 && <div className="track-output-plays" aria-label="Jouer sur une autre sortie">
      {alternateOutputs.map((output) => <button type="button" key={output.id} style={{ '--output-color': output.color } as React.CSSProperties} onClick={() => onOutputPlay(output.id)} aria-label={`Jouer ${track.title} sur ${output.name}`} title={output.name}><Play size={11} fill="currentColor" /></button>)}
    </div>}
    {(historyProgress > 0 || playbacks.length > 0) && <span className={`track-progress ${playbacks.length > 0 ? 'is-playing' : ''}`} aria-hidden="true">
      {playbacks.length === 0 && historyProgress > 0 && <i className="history" style={{ transform: `scaleX(${historyProgress})` }} />}
      {playbacks.map((playback) => <i className="active" key={`${playback.id}:${playback.resumedAtMs}:${playback.elapsedMs}:${playback.paused}`} style={{
        '--progress-duration': `${playback.durationMs}ms`,
        '--progress-delay': `-${playback.elapsedMs}ms`,
        '--progress-iterations': playback.loop ? 'infinite' : '1',
        animationPlayState: playback.paused ? 'paused' : 'running',
      } as React.CSSProperties} />)}
    </span>}
    {download && <span className={`track-download ${download.total ? '' : 'is-indeterminate'}`} role="progressbar" aria-label={`Téléchargement de ${track.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={download.total ? Math.min(100, Math.round(download.received / download.total * 100)) : undefined} style={{ '--download-progress': `${download.total ? Math.min(100, download.received / download.total * 100) : 0}%` } as React.CSSProperties}>
      <span className="track-download-fill" />
      <span className="track-download-marker"><Download size={12} /><span>{download.total ? `${Math.min(100, Math.round(download.received / download.total * 100))} %` : '…'}</span></span>
    </span>}
    <div className="track-meta" data-track-drag-handle draggable={canDrag} title={canDrag ? (selectionMode ? 'Glisser pour déplacer les morceaux sélectionnés' : 'Glisser pour déplacer ce morceau') : undefined}>
      <span className="track-duration">{loaded && <span className="track-loaded" title="Disponible hors ligne" aria-label="Disponible hors ligne"><CircleCheck size={13} /></span>}{isVideoTrack(track) && 'Vidéo · '}{track.durationMs ? formatDuration((track.endTimeMs ?? track.durationMs) - track.startTimeMs) : '—:—'}</span>
      <span className="track-card-secondary">{track.loop && <InfinityIcon size={15} />}{shortcut ? `Touche ${shortcut}` : `${Math.min(100, Math.round(track.volume * 100))} %`}</span>
      <span className="track-list-shortcut" title={shortcut ? `Raccourci ${shortcut}` : 'Aucun raccourci'}>{track.loop && <InfinityIcon size={15} />}{shortcut ?? '—'}</span>
    </div>
  </article>;
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
