import { useRef, useState, type FormEvent } from 'react';
import { FileAudio, LoaderCircle, Upload, X } from 'lucide-react';
import { api } from '../lib/api';
import { readAudioFileDurationMs } from '../lib/audio-file-metadata';
import type { Category } from '../types';
import { TrackTagsInput } from './TrackTagsInput';

interface Props {
  projectId: string;
  categories: Category[];
  onClose: () => void;
  onUploaded: () => void;
}

export function UploadDialog({ projectId, categories, onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setError('Choisissez un fichier audio ou vidéo.');
    const data = new FormData(event.currentTarget);
    data.set('projectId', projectId);
    data.set('file', file);
    data.set('tags', tags.join(','));
    setLoading(true);
    setError('');
    try {
      const durationMs = await readAudioFileDurationMs(file);
      if (durationMs) data.set('durationMs', String(durationMs));
      await api.uploadTrack(data);
      onUploaded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Import impossible.');
    } finally { setLoading(false); }
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="dialog" onSubmit={submit}>
      <header><div><p className="eyebrow">Bibliothèque</p><h2>Ajouter un média</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></header>
      <button type="button" className={`drop-zone ${file ? 'has-file' : ''}`} onClick={() => input.current?.click()}>
        {file ? <><FileAudio size={36} /><strong>{file.name}</strong><span>{formatSize(file.size)}</span></> : <><Upload size={36} /><strong>Choisir un fichier audio ou vidéo</strong><span>MP3, WAV, OGG, FLAC, AAC, MP4, WebM · 250 Mo maximum</span></>}
      </button>
      <input ref={input} hidden type="file" name="file" accept="audio/*,.flac,video/mp4,video/webm,.mp4,.webm" onChange={(event) => {
        const selected = event.target.files?.[0]; setFile(selected); if (selected) setError('');
      }} />
      <label>Titre<input name="title" required defaultValue={file?.name.replace(/\.[^.]+$/, '') ?? ''} key={file?.name} placeholder="Entrée des comédiens" /></label>
      <label>Catégorie<select name="categoryId" defaultValue=""><option value="">Sans catégorie</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <TrackTagsInput tags={tags} onChange={setTags} />
      {error && <p className="form-error">{error}</p>}
      <footer><button type="button" className="button ghost" onClick={onClose}>Annuler</button><button className="button primary" disabled={loading || !file}>{loading && <LoaderCircle className="spin" size={18} />}Importer</button></footer>
    </form>
  </div>;
}

function formatSize(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(1)} Mo`; }
