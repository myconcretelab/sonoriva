import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MouseAction } from '../types';

interface Props {
  label: string;
  value: MouseAction;
  options: Array<{ value: MouseAction; label: string }>;
  onChange: (value: MouseAction) => void;
}

export function RetroActionSelector({ label, value, options, onChange }: Props) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  return <div className="retro-action-selector" role="group" aria-label={label}>
    <button type="button" disabled={index === 0} aria-label={`${label} : action précédente`} onClick={() => onChange(options[index - 1].value)}><ChevronLeft size={15} /></button>
    <div className="retro-action-window">
      <output aria-live="polite" aria-label={`Action pour ${label}`}>{options[index].label}</output>
      <span className="retro-action-detents" aria-hidden="true">{options.map((option, position) => <i key={option.value} className={position === index ? 'active' : ''} />)}</span>
    </div>
    <button type="button" disabled={index === options.length - 1} aria-label={`${label} : action suivante`} onClick={() => onChange(options[index + 1].value)}><ChevronRight size={15} /></button>
  </div>;
}
