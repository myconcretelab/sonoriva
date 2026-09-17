import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { Category } from '../types';
import { api } from '../lib/api';
import { BackgroundImageField } from './BackgroundImageField';

export function CategoryBackgroundDialog({ category, onClose, onChanged }: {
  category: Category; onClose: () => void; onChanged: () => void;
}) {
  const [image, setImage] = useState(category.backgroundImage ?? null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (preparing || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.updateCategoryBackground(category.projectId, category.id, image);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.');
      setBusy(false);
    }
  }
  return <div className="dialog-backdrop">
    <form className="dialog" onSubmit={submit}>
      <header><h2>Fond de {category.name}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Fermer"><X /></button></header>
      <BackgroundImageField value={image} onChange={setImage} onBusyChange={setPreparing} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><button type="button" className="button ghost" onClick={onClose}>Annuler</button><button className="button primary" disabled={busy || preparing}>Enregistrer</button></footer>
    </form>
  </div>;
}
