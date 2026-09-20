import { useState } from 'react';
import { CheckCheck, ChevronDown } from 'lucide-react';
import { greyPlayedForCategory, type SoundboardViewSettings } from '../lib/soundboard-view';

interface Props {
  settings: SoundboardViewSettings;
  categoryId?: string;
  onChange: (enabled: boolean, categoryId?: string) => void;
}

export function PlayedSoundsControl({ settings, categoryId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<'category' | 'all'>('category');
  const targetCategory = scope === 'category' ? categoryId : undefined;
  const enabled = greyPlayedForCategory(settings, targetCategory);
  const label = `Griser les sons déjà joués — ${targetCategory ? 'cette catégorie' : 'toutes les catégories'}`;
  return <div className="dashboard-control played-sounds-control" onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
    <button type="button" className={`dashboard-button ${enabled ? 'active' : ''}`} aria-label={label} title={label} aria-pressed={enabled} onClick={() => onChange(!enabled, targetCategory)}><CheckCheck size={18} /></button>
    <button type="button" className="dashboard-button played-sounds-options" aria-label="Portée du marquage des sons joués" title="Portée du marquage" aria-expanded={open} onClick={() => setOpen(!open)}><ChevronDown size={12} /></button>
    {open && <div className="dashboard-popover played-sounds-popover">
      <strong>Sons déjà joués</strong>
      <label>Appliquer à<select value={targetCategory ? 'category' : 'all'} onChange={(event) => setScope(event.target.value as 'category' | 'all')}><option value="category" disabled={!categoryId}>Cette catégorie</option><option value="all">Toutes les catégories</option></select></label>
      <label className="played-sounds-switch"><input type="checkbox" checked={enabled} onChange={(event) => onChange(event.target.checked, targetCategory)} />Griser les sons déjà joués</label>
      <small>La réinitialisation des progressions efface le marquage.</small>
    </div>}
  </div>;
}
