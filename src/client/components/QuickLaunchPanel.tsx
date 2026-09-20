import { useState } from 'react';
import { Play, Rocket, Settings2, Trash2, X, Replace } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { QuickLaunchState } from '../lib/quick-launch';
import type { Track } from '../types';

interface Props {
  state: QuickLaunchState;
  tracks: Track[];
  shortcut: string;
  onUpdate: (patch: Partial<QuickLaunchState>) => void;
  onDropTracks: (ids: string[]) => void;
  onLaunch: (id?: string) => void;
}
export function QuickLaunchPanel({ state, tracks, shortcut, onUpdate, onDropTracks, onLaunch }: Props) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const accepts = (types: readonly string[]) => types.some((type) => ['application/x-sonoriva-track', 'application/x-sonoriva-track-selection', 'text/plain'].includes(type));
  return <>
    <div className={`quick-launch-panel size-${state.size} ${tracks.length ? '' : 'is-empty'} ${dragOver ? 'is-drag-over' : ''}`} aria-label="Zone de départ rapide" title={tracks.length ? 'Départ rapide' : 'Glissez des sons ici pour préparer leur départ rapide'}
      onDragOver={(event) => { if (!accepts(event.dataTransfer.types)) return; event.preventDefault(); event.stopPropagation(); setDragOver(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false); }}
      onDrop={(event) => {
        if (!accepts(event.dataTransfer.types)) return;
        event.preventDefault(); event.stopPropagation(); setDragOver(false);
        const ids = event.dataTransfer.getData('application/x-sonoriva-track-selection') || event.dataTransfer.getData('application/x-sonoriva-track') || event.dataTransfer.getData('text/plain');
        onDropTracks(ids.split(','));
      }}>
      {tracks.length > 0 && <>
        <header><Rocket size={16} /><button type="button" className="icon-button" title="Options du départ rapide" aria-label="Options du départ rapide" onClick={() => setOptionsOpen(true)}><Settings2 size={16} /></button>
          <button type="button" className={`icon-button ${state.replace ? 'active' : ''}`} aria-label="Remplacer les lectures en cours" title="Remplacer les lectures en cours" aria-pressed={state.replace} onClick={() => onUpdate({ replace: !state.replace })}><Replace size={16} /></button>
          <button type="button" className="icon-button" aria-label="Lancer le départ rapide" title={`Lancer tous les sons (${shortcut})`} onClick={() => onLaunch()}><Play size={16} /></button>
          <button type="button" className="icon-button" aria-label="Vider le départ rapide" title="Vider la zone" onClick={() => onUpdate({ trackIds: [] })}><Trash2 size={16} /></button></header>
        <div className="quick-launch-tracks">{tracks.map((track) => <button type="button" className="quick-launch-pad" key={track.id} title={`Lancer ${track.title}`} onClick={() => onLaunch(track.id)} style={track.backgroundImage ? { backgroundImage: `linear-gradient(#0008, #0008), url("${track.backgroundImage}")` } : undefined}><Play size={18} /><span>{track.title}</span></button>)}</div>
      </>}
    </div>
    {optionsOpen && createPortal(<div className="dialog-backdrop" onClick={() => setOptionsOpen(false)}><section className="dialog quick-launch-options" role="dialog" aria-modal="true" aria-label="Options du départ rapide" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') setOptionsOpen(false); }}>
      <header><h2><Rocket size={20} /> Départ rapide</h2><button type="button" className="icon-button" aria-label="Fermer" autoFocus onClick={() => setOptionsOpen(false)}><X size={20} /></button></header>
      <label>Taille des carrés<select value={state.size} onChange={(event) => onUpdate({ size: event.target.value as QuickLaunchState['size'] })}><option value="mini">Mini</option><option value="medium">Moyen</option><option value="large">Grand</option></select></label>
      <label><input type="checkbox" checked={state.removeAfterLaunch} onChange={(event) => onUpdate({ removeAfterLaunch: event.target.checked })} /> Retirer les sons après leur lancement</label>
      <label><input type="checkbox" checked={state.replace} onChange={(event) => onUpdate({ replace: event.target.checked })} /> Remplacer les lectures en cours</label>
      <p>Raccourci de lancement : {shortcut}. Modifiable dans les raccourcis clavier.</p>
      <button type="button" onClick={() => { onUpdate({ enabled: false }); setOptionsOpen(false); }}>Masquer la zone</button>
    </section></div>, document.body)}
  </>;
}
