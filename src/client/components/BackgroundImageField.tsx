import { useState } from 'react';

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function BackgroundImageField({ value, onChange, onBusyChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function select(file: File) {
    setError('');
    setBusy(true);
    onBusyChange?.(true);
    const url = URL.createObjectURL(file);
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
        throw new Error('Choisissez une image JPEG, PNG ou WebP de 10 Mo maximum.');
      }
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Conversion de l’image impossible.');
      context.fillStyle = '#18181b';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let encoded = canvas.toDataURL('image/jpeg', 0.8);
      for (const quality of [0.65, 0.5, 0.35, 0.2]) {
        if (encoded.length <= 110_000) break;
        encoded = canvas.toDataURL('image/jpeg', quality);
      }
      if (encoded.length > 110_000) throw new Error('Image trop détaillée : choisissez une image plus petite.');
      onChange(encoded);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lecture de l’image impossible.');
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return <section className="background-image-field">
    <label>Image de fond<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void select(file);
    }} /></label>
    <small>JPEG, PNG ou WebP · 10 Mo maximum · redimensionnée à 640 px.</small>
    {value && <div className="background-image-preview" style={{ backgroundImage: `linear-gradient(#0009, #0009), url("${value}")` }}><span>Aperçu du titre</span></div>}
    {value && <button className="button ghost" type="button" disabled={busy} onClick={() => onChange(null)}>Supprimer l’image</button>}
    {busy && <small>Préparation de l’image…</small>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
