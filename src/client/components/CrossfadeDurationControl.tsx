import { Blend } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  disabled?: boolean;
  className?: string;
  onCommit: (value: number) => void;
}

function formatCrossfadeDuration(durationMs: number): string {
  if (durationMs === 0) return '0 s';
  const seconds = durationMs / 1_000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(2).replace('.', ',')} s`;
}

export function CrossfadeDurationControl({ value, disabled = false, className = '', onCommit }: Props) {
  const [draft, setDraft] = useState(value);
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

  return <label className={`crossfade-duration-control ${className}`.trim()}>
    <span><Blend size={13} />Durée du fondu</span>
    <input type="range" min="0" max="20000" step="250" value={draft} disabled={disabled}
      onChange={(event) => setDraft(Number(event.target.value))}
      onPointerUp={(event) => { commit(Number(event.currentTarget.value)); event.currentTarget.blur(); }}
      onPointerCancel={(event) => commit(Number(event.currentTarget.value))}
      onKeyUp={(event) => commit(Number(event.currentTarget.value))}
      onBlur={(event) => commit(Number(event.currentTarget.value))}
      aria-label="Durée du fondu enchaîné" />
    <output>{formatCrossfadeDuration(draft)}</output>
  </label>;
}
