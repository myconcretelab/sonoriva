import { isVideoTrack } from '../lib/video-engine';
import { VideoEditor } from './VideoEditor';
import { useState, type FormEvent } from 'react';
import { LoaderCircle, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Category, ProjectColor, Track } from '../types';
import { TrackTagsInput } from './TrackTagsInput';
import { WaveformEditor } from './WaveformEditor';

interface Props { track: Track; categories: Category[]; projectColors: ProjectColor[]; onAddProjectColor: (color: string) => Promise<void>; onClose: () => void; onChanged: () => void }

export function TrackDialog({ track, categories, projectColors, onAddProjectColor, onClose, onChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const [error, setError] = useState('');
  const [startTimeMs, setStartTimeMs] = useState(track.startTimeMs);
  const [endTimeMs, setEndTimeMs] = useState<number | null>(track.endTimeMs);
  const [tags, setTags] = useState(track.tags ?? []);
  const inheritedColor = categories.find((category) => category.id === track.categoryId)?.color ?? '#DBEDF7';
  const [color, setColor] = useState(track.color ?? inheritedColor);
  const colorIsPreset = projectColors.some((item) => item.color.toLowerCase() === color.toLowerCase());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api.updateTrack(track.id, {
        title: String(data.get('title')),
        categoryId: String(data.get('categoryId')) || null,
        volume: Number(data.get('volume')) / 100,
        loop: data.get('loop') === 'on',
        fadeInMs: Number(data.get('fadeInMs')),
        fadeOutMs: Number(data.get('fadeOutMs')),
        ...(isVideoTrack(track) ? { videoEndBehavior: String(data.get('videoEndBehavior')) as 'black' | 'hold' } : {}),
        startTimeMs,
        endTimeMs,
        color,
        tags,
      });
      onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Modification impossible.'); setLoading(false); }
  }

  async function remove() {
    if (!window.confirm(`Supprimer définitivement « ${track.title} » ?`)) return;
    setLoading(true);
    try { await api.deleteTrack(track.id); onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Suppression impossible.'); setLoading(false); }
  }

  async function saveColorToProject() {
    setSavingColor(true); setError('');
    try { await onAddProjectColor(color); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Ajout de la couleur impossible.'); }
    finally { setSavingColor(false); }
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="dialog track-dialog" onSubmit={submit}>
      <header><div><p className="eyebrow">{isVideoTrack(track) ? 'Réglages de la vidéo' : 'Réglages du son'}</p><h2>{track.title}</h2></div><div className="track-dialog-header-actions"><button type="submit" className="button primary" disabled={loading} aria-label="Enregistrer">{loading ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}<span>Enregistrer</span></button><button type="button" className="icon-button" onClick={onClose} aria-label="Fermer les réglages"><X /></button></div></header>
      <div className="track-title-color-row">
        <label>Titre<input name="title" defaultValue={track.title} required /></label>
        <label className="track-color-field">Couleur<input name="color" type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Couleur personnalisée du morceau" /></label>
      </div>
      <section className="track-color-options">
        <div><strong>Couleurs du spectacle</strong><span>Choisissez une couleur prédéfinie ou créez la vôtre.</span></div>
        <div className="track-color-swatches">
          {projectColors.map((item) => <button key={item.id} type="button" className={item.color.toLowerCase() === color.toLowerCase() ? 'active' : ''} style={{ '--palette-color': item.color } as React.CSSProperties} onClick={() => setColor(item.color)} aria-label={`Utiliser la couleur ${item.color}`} title={item.color}><span /></button>)}
          {projectColors.length === 0 && <em>Aucune couleur enregistrée pour ce spectacle.</em>}
        </div>
        {!colorIsPreset && <button type="button" className="button ghost track-color-save" disabled={savingColor} onClick={saveColorToProject}>{savingColor ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}Enregistrer cette couleur dans le spectacle</button>}
      </section>
      <label>Catégorie<select name="categoryId" defaultValue={track.categoryId ?? ''}><option value="">Sans catégorie</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <TrackTagsInput tags={tags} onChange={setTags} />
      {isVideoTrack(track) ? <VideoEditor track={track} startMs={startTimeMs} endMs={endTimeMs} onStartChange={setStartTimeMs} onEndChange={setEndTimeMs} /> : <WaveformEditor track={track} startMs={startTimeMs} endMs={endTimeMs} onStartChange={setStartTimeMs} onEndChange={setEndTimeMs} />}
      <label>Volume · {Math.min(100, Math.round(track.volume * 100))} %<input name="volume" type="range" min="0" max="100" defaultValue={Math.min(100, track.volume * 100)} /></label>
      <div className="field-row"><label>Fondu d’entrée (ms)<input name="fadeInMs" type="number" min="0" max="60000" defaultValue={track.fadeInMs} /></label><label>Fondu de sortie (ms)<input name="fadeOutMs" type="number" min="0" max="60000" defaultValue={track.fadeOutMs} /></label></div>
      <label className="check"><input name="loop" type="checkbox" defaultChecked={track.loop} /> Jouer en boucle</label>
      {error && <p className="form-error">{error}</p>}
      <footer className="spread"><button type="button" className="button danger" onClick={remove}><Trash2 size={17} />Supprimer</button><span><button type="button" className="button ghost" onClick={onClose}>Annuler</button><button className="button primary" disabled={loading}>{loading && <LoaderCircle className="spin" size={18} />}Enregistrer</button></span></footer>
    </form>
  </div>;
}
