import { Clock3 } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface Props {
  value: number;
  disabled?: boolean;
  className?: string;
  label?: string;
  resetAfterUse?: boolean;
  onResetAfterUseChange?: (enabled: boolean) => void;
  onCommit: (value: number) => void;
}

function formatCrossfadeDuration(durationMs: number): string {
  if (durationMs === 0) return '0 s';
  const seconds = durationMs / 1_000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1).replace('.', ',')} s`;
}

export function CrossfadeDurationControl({ value, disabled = false, className = '', label = 'Fondu', resetAfterUse = false, onResetAfterUseChange, onCommit }: Props) {
  const [draft, setDraft] = useState(value);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const lastCommitted = useRef(value);

  useEffect(() => {
    setDraft(value);
    lastCommitted.current = value;
  }, [value]);

  function commit(next: number) {
    if (next === lastCommitted.current) return;
    lastCommitted.current = next;
    onCommit(next);
  }

  return <div className={`crossfade-duration-control ${className}`.trim()}>
    <span className="crossfade-duration-label"><Clock3 size={13} />{label}</span>
    <span className="crossfade-duration-slider" style={{ '--crossfade-progress': `${draft / 200}%` } as CSSProperties}>
      <input type="range" min="0" max="20000" step="500" value={draft} disabled={disabled}
        onChange={(event) => setDraft(Number(event.target.value))}
        onFocus={() => setPopoverOpen(true)}
        onPointerDown={() => setPopoverOpen(true)}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onPointerCancel={(event) => { commit(Number(event.currentTarget.value)); setPopoverOpen(false); }}
        onKeyUp={(event) => commit(Number(event.currentTarget.value))}
        onBlur={(event) => { commit(Number(event.currentTarget.value)); setPopoverOpen(false); }}
        aria-label="Durée du fondu enchaîné"
        aria-valuetext={formatCrossfadeDuration(draft)} />
      {popoverOpen && <output className="crossfade-duration-popover" aria-live="polite">{formatCrossfadeDuration(draft)}</output>}
    </span>
    {onResetAfterUseChange && <label className="crossfade-reset-toggle" title={resetAfterUse ? 'Désactiver la réinitialisation après le fondu' : 'Réinitialiser la durée après le fondu'}>
      <input type="checkbox" checked={resetAfterUse} disabled={disabled} onChange={(event) => onResetAfterUseChange(event.target.checked)} aria-label="Réinitialiser la durée après le fondu" />
      <span aria-hidden="true" />
    </label>}
  </div>;
}
