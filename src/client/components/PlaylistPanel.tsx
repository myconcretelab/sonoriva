import { useEffect, useRef, useState } from 'react';
import { Blend, Clock3, GripHorizontal, GripVertical, Layers3, ListMusic, LoaderCircle, Pause, Play, Repeat2, Save, Shuffle, SkipForward, SlidersHorizontal, Square, Trash2, X, Zap } from 'lucide-react';
import { playlistRows, type PlaylistItemPlacement, type PlaylistQueueItem } from '../lib/playlist-rows';
import type { ProjectColor, Track } from '../types';

export type { PlaylistQueueItem } from '../lib/playlist-rows';
export interface PlaylistOptions { name: string; color: string; autostart: boolean; loop: boolean; random: boolean; showNextButton: boolean; gapMs: number; crossfadeMs: number; soundboardBehavior?: 'continue' | 'pause' | 'stop' }

interface Props {
  items: PlaylistQueueItem[];
  tracks: Track[];
  colors: ProjectColor[];
  options: PlaylistOptions;
  currentRowIndex: number;
  maxGroupSize: number;
  playbackActive: boolean;
  playbackPaused: boolean;
  saved: boolean;
  saving: boolean;
  optionsOpen: boolean;
  onOptionsOpenChange: (open: boolean) => void;
  onOptionsChange: (patch: Partial<PlaylistOptions>) => void;
  onDropTrack: (trackId: string, targetRowId?: string, placement?: PlaylistItemPlacement) => void;
  onMoveItem: (itemId: string, targetRowId: string, placement: PlaylistItemPlacement) => void;
  onRemoveItem: (itemId: string) => void;
  onPlayRow: (index: number) => void;
  onPlayPause: () => void;
  onStop: () => void;
  onNext: () => void;
  onSave: () => void;
  onDelete: () => void;
  onClear: () => void;
}

const trackMime = 'application/x-sonoriva-track';
const playlistItemMime = 'application/x-sonoriva-playlist-item';
const panelHeightStorageKey = 'sonoriva-playlist-panel-height';
const panelMinHeight = 160;

function maxPanelHeight() {
  return Math.max(panelMinHeight, Math.min(680, window.innerHeight - 390));
}

function clampPanelHeight(height: number) {
  return Math.min(maxPanelHeight(), Math.max(panelMinHeight, height));
}

function formatTransitionDuration(durationMs: number) {
  if (durationMs === 0) return 'Aucun';
  return `${(durationMs / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} s`;
}

export function PlaylistPanel({ items, tracks, colors, options, currentRowIndex, maxGroupSize, playbackActive, playbackPaused, saved, saving, optionsOpen, onOptionsOpenChange, onOptionsChange, onDropTrack, onMoveItem, onRemoveItem, onPlayRow, onPlayPause, onStop, onNext, onSave, onDelete, onClear }: Props) {
  const [panelHeight, setPanelHeight] = useState(() => {
    const storedHeight = Number(localStorage.getItem(panelHeightStorageKey));
    return clampPanelHeight(Number.isFinite(storedHeight) && storedHeight > 0 ? storedHeight : 320);
  });
  const [playlistDragActive, setPlaylistDragActive] = useState(false);
  const [titlePopover, setTitlePopover] = useState<{ title: string; left: number; top: number }>();
  const resizeRef = useRef<{ startY: number; startHeight: number; latestHeight: number } | undefined>(undefined);
  const dragDepthRef = useRef(0);
  const renderedHeight = clampPanelHeight(optionsOpen ? Math.max(panelHeight, 560) : panelHeight);
  const rows = playlistRows(items);

  useEffect(() => {
    if (!playlistDragActive) return;
    const clearDragState = () => {
      dragDepthRef.current = 0;
      setPlaylistDragActive(false);
    };
    window.addEventListener('dragend', clearDragState);
    window.addEventListener('drop', clearDragState);
    return () => {
      window.removeEventListener('dragend', clearDragState);
      window.removeEventListener('drop', clearDragState);
    };
  }, [playlistDragActive]);

  function acceptsPlaylistDrop(event: React.DragEvent): boolean {
    return event.dataTransfer.types.includes(trackMime) || event.dataTransfer.types.includes(playlistItemMime);
  }

  function dropOnRow(event: React.DragEvent, rowId: string, placement: PlaylistItemPlacement) {
    if (!acceptsPlaylistDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setPlaylistDragActive(false);
    const itemId = event.dataTransfer.getData(playlistItemMime);
    const trackId = event.dataTransfer.getData(trackMime);
    if (itemId) onMoveItem(itemId, rowId, placement);
    else if (trackId) onDropTrack(trackId, rowId, placement);
  }

  function showFullTitle(element: HTMLElement, title: string) {
    const titleElement = element.querySelector('strong');
    if (titleElement && titleElement.scrollWidth <= titleElement.clientWidth) {
      setTitlePopover(undefined);
      return;
    }
    const bounds = element.getBoundingClientRect();
    setTitlePopover({
      title,
      left: Math.min(Math.max(10, bounds.left), Math.max(10, window.innerWidth - 310)),
      top: bounds.top - 7,
    });
  }

  function persistHeight(height: number) {
    localStorage.setItem(panelHeightStorageKey, String(Math.round(height)));
  }

  function resizeWithKeyboard(direction: number) {
    setPanelHeight((current) => {
      const next = clampPanelHeight(current + direction * 24);
      persistHeight(next);
      return next;
    });
  }

  return <section className={`playlist-panel ${optionsOpen ? 'options-open' : ''}`} style={{ '--playlist-color': options.color, '--playlist-panel-height': `${renderedHeight}px` } as React.CSSProperties}>
    <div className="playlist-resizer" role="separator" aria-label="Régler la hauteur du panneau playlist" aria-orientation="horizontal" aria-valuemin={panelMinHeight} aria-valuemax={maxPanelHeight()} aria-valuenow={Math.round(renderedHeight)} tabIndex={0} title="Glisser pour régler la hauteur · Flèches haut et bas"
      onKeyDown={(event) => { if (event.key === 'ArrowUp') { event.preventDefault(); resizeWithKeyboard(1); } else if (event.key === 'ArrowDown') { event.preventDefault(); resizeWithKeyboard(-1); } }}
      onPointerDown={(event) => { resizeRef.current = { startY: event.clientY, startHeight: renderedHeight, latestHeight: renderedHeight }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { if (!resizeRef.current) return; const next = clampPanelHeight(resizeRef.current.startHeight + resizeRef.current.startY - event.clientY); resizeRef.current.latestHeight = next; setPanelHeight(next); }}
      onPointerUp={(event) => { if (!resizeRef.current) return; persistHeight(resizeRef.current.latestHeight); resizeRef.current = undefined; event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { if (resizeRef.current) persistHeight(resizeRef.current.latestHeight); resizeRef.current = undefined; }}><GripHorizontal size={19} /></div>
    <header><div><ListMusic size={15} /><strong>{options.name || 'Nouvelle playlist'}</strong><em title={`${rows.length} rangée${rows.length !== 1 ? 's' : ''} · ${items.length} morceau${items.length !== 1 ? 'x' : ''}`}>{rows.length}</em></div><button type="button" onClick={onClear} disabled={items.length === 0} aria-label="Vider la playlist" title="Vider"><Trash2 size={14} /></button></header>
    <div className="playlist-toolbar">
      <button type="button" onClick={onSave} disabled={items.length === 0 || saving} aria-label="Sauvegarder la playlist" title={saved ? 'Mettre à jour la playlist' : 'Sauvegarder la playlist'}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}</button>
      <button type="button" className={optionsOpen ? 'active' : ''} onClick={() => onOptionsOpenChange(!optionsOpen)} aria-label="Options de la playlist" title="Options"><SlidersHorizontal size={15} /></button>
      <button type="button" onClick={onNext} disabled={items.length === 0} aria-label="Rangée suivante" title="Rangée suivante"><SkipForward size={15} fill="currentColor" /></button>
      <button type="button" onClick={onPlayPause} disabled={items.length === 0} aria-label={playbackActive && !playbackPaused ? 'Mettre la playlist en pause' : 'Lire la playlist'} title={playbackActive && !playbackPaused ? 'Pause' : 'Lecture'}>{playbackActive && !playbackPaused ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button>
      <button type="button" className="stop" onClick={onStop} disabled={!playbackActive} aria-label="Arrêter la playlist" title="Stop"><Square size={14} fill="currentColor" /></button>
    </div>
    {optionsOpen && <div className="playlist-options">
      <label>Nom<input value={options.name} maxLength={120} onChange={(event) => onOptionsChange({ name: event.target.value })} /></label>
      <label>Couleur<div className="playlist-color-choice"><input type="color" value={options.color} onChange={(event) => onOptionsChange({ color: event.target.value })} />{colors.map((item) => <button type="button" key={item.id} className={item.color.toLowerCase() === options.color.toLowerCase() ? 'active' : ''} style={{ '--swatch-color': item.color } as React.CSSProperties} onClick={() => onOptionsChange({ color: item.color })} aria-label={`Couleur ${item.color}`} />)}</div></label>
      <label>Au lancement d’un son du soundboard<select value={options.soundboardBehavior ?? 'continue'} onChange={(event) => onOptionsChange({ soundboardBehavior: event.target.value as 'continue' | 'pause' | 'stop' })}>
        <option value="continue">Continuer la playlist</option>
        <option value="pause">Mettre la playlist en pause</option>
        <option value="stop">Arrêter la playlist</option>
      </select></label>
      <div className="playlist-option-switches">
        <label><input type="checkbox" checked={options.autostart} onChange={(event) => onOptionsChange({ autostart: event.target.checked })} /><Zap size={13} />Autostart</label>
        <label><input type="checkbox" checked={options.loop} onChange={(event) => onOptionsChange({ loop: event.target.checked })} /><Repeat2 size={13} />Boucle</label>
        <label><input type="checkbox" checked={options.random} onChange={(event) => onOptionsChange({ random: event.target.checked })} /><Shuffle size={13} />Aléatoire</label>
        <label><input type="checkbox" checked={options.showNextButton} onChange={(event) => onOptionsChange({ showNextButton: event.target.checked })} /><SkipForward size={13} />Grand bouton Suivant</label>
      </div>
      <div className="playlist-transition-options">
        <label><span><Clock3 size={13} />Blanc entre les titres<strong>{formatTransitionDuration(options.gapMs)}</strong></span><input type="range" min="0" max="10000" step="250" value={options.gapMs} onChange={(event) => { const gapMs = Number(event.target.value); onOptionsChange({ gapMs, ...(gapMs > 0 ? { crossfadeMs: 0 } : {}) }); }} /></label>
        <label><span><Blend size={13} />Mix par fondu enchaîné<strong>{formatTransitionDuration(options.crossfadeMs)}</strong></span><input type="range" min="0" max="10000" step="250" value={options.crossfadeMs} onChange={(event) => { const crossfadeMs = Number(event.target.value); onOptionsChange({ crossfadeMs, ...(crossfadeMs > 0 ? { gapMs: 0 } : {}) }); }} /></label>
      </div>
      {saved && <button type="button" className="playlist-delete-saved" onClick={onDelete}><Trash2 size={13} />Supprimer la playlist enregistrée</button>}
    </div>}
    {options.showNextButton && !optionsOpen && <button type="button" className="playlist-next-large" onClick={onNext} disabled={items.length === 0}><SkipForward size={24} fill="currentColor" /><span><strong>Morceau suivant</strong><small>Passer à la rangée suivante</small></span></button>}
    <div className={`playlist-dropzone ${items.length === 0 ? 'empty' : ''} ${playlistDragActive ? 'is-dragging' : ''}`}
      onDragEnter={(event) => { if (!acceptsPlaylistDrop(event)) return; dragDepthRef.current += 1; setPlaylistDragActive(true); }}
      onDragLeave={(event) => { if (!acceptsPlaylistDrop(event)) return; dragDepthRef.current = Math.max(0, dragDepthRef.current - 1); if (dragDepthRef.current === 0) setPlaylistDragActive(false); }}
      onDragOver={(event) => { if (acceptsPlaylistDrop(event)) { event.preventDefault(); setPlaylistDragActive(true); event.dataTransfer.dropEffect = event.dataTransfer.types.includes(trackMime) ? 'copy' : 'move'; } }}
      onDrop={(event) => { const trackId = event.dataTransfer.getData(trackMime); if (!trackId) return; event.preventDefault(); dragDepthRef.current = 0; setPlaylistDragActive(false); onDropTrack(trackId); }}>
      {items.length === 0 && <div className="playlist-drop-hint"><ListMusic size={22} /><strong>Glissez des morceaux ici</strong><span>Une rangée est lue simultanément.</span></div>}
      {rows.map((row, rowIndex) => <div className="playlist-row-block" key={row.id}>
        <div className="playlist-row-insert" aria-label={`Insérer avant la rangée ${rowIndex + 1}`}
          onDragOver={(event) => { if (acceptsPlaylistDrop(event)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes(trackMime) ? 'copy' : 'move'; } }}
          onDrop={(event) => dropOnRow(event, row.id, 'before')}><span>Insérer ici</span></div>
        <div className={`playlist-row ${rowIndex === currentRowIndex ? 'current' : ''}`}>
          <button type="button" className="playlist-row-play" onClick={() => onPlayRow(rowIndex)} aria-label={`Lire la rangée ${rowIndex + 1}`}><Play size={11} fill="currentColor" /><span>{rowIndex + 1}</span></button>
          <div className="playlist-row-items" style={{ '--playlist-row-item-count': row.items.length } as React.CSSProperties}>
            {row.items.map((item) => {
              const track = tracks.find((candidate) => candidate.id === item.trackId);
              if (!track) return null;
              return <article key={item.id} draggable tabIndex={0} aria-label={`${track.title}. Glisser pour déplacer ce morceau.`}
                onMouseEnter={(event) => showFullTitle(event.currentTarget, track.title)} onMouseLeave={() => setTitlePopover(undefined)} onFocus={(event) => showFullTitle(event.currentTarget, track.title)} onBlur={() => setTitlePopover(undefined)}
                onDragStart={(event) => { event.stopPropagation(); setTitlePopover(undefined); setPlaylistDragActive(true); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(playlistItemMime, item.id); }}
                onDragEnd={() => { dragDepthRef.current = 0; setPlaylistDragActive(false); }}
                onDragOver={(event) => { if (acceptsPlaylistDrop(event)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes(trackMime) ? 'copy' : 'move'; } }}
                onDrop={(event) => dropOnRow(event, row.id, 'group')}>
                <GripVertical size={12} aria-hidden="true" /><strong>{track.title}</strong><button type="button" onClick={() => onRemoveItem(item.id)} aria-label={`Retirer ${track.title}`}><X size={12} /></button>
              </article>;
            })}
          </div>
          {row.items.length > 1 && <span className="playlist-row-group" title={`${row.items.length} morceaux joués ensemble`}><Layers3 size={12} />{row.items.length}</span>}
          {row.items.length >= maxGroupSize && <span className="playlist-row-limit" title={`Limite de ${maxGroupSize} atteinte`}>max</span>}
        </div>
      </div>)}
      {rows.length > 0 && <div className="playlist-row-insert last" aria-label="Insérer à la fin"
        onDragOver={(event) => { if (acceptsPlaylistDrop(event)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes(trackMime) ? 'copy' : 'move'; } }}
        onDrop={(event) => dropOnRow(event, rows.at(-1)!.id, 'after')}><span>Insérer à la fin</span></div>}
    </div>
    {titlePopover && <div className="playlist-title-popover" style={{ left: titlePopover.left, top: titlePopover.top }} role="tooltip"><span>Titre du morceau</span><strong>{titlePopover.title}</strong></div>}
  </section>;
}
