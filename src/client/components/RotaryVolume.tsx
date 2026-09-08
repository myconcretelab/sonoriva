import { useRef, type CSSProperties, type PointerEvent } from 'react';

interface Props {
  value: number;
  label: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

/** A native accessible range with a rotary face and relative vertical dragging. */
export function RotaryVolume({ value, label, disabled = false, onChange }: Props) {
  const drag = useRef<{ pointerId: number; y: number; value: number } | null>(null);
  const percentage = Math.min(100, Math.max(0, value));

  function move(event: PointerEvent<HTMLInputElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId || disabled) return;
    // Two pixels per percent: pressing the knob never changes the current volume.
    onChange(Math.min(100, Math.max(0, Math.round(start.value + (start.y - event.clientY) / 2))));
  }

  function end(event: PointerEvent<HTMLInputElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <span className={`rotary-volume${disabled ? ' is-disabled' : ''}`} style={{ '--knob-angle': `${-135 + percentage * 2.7}deg` } as CSSProperties}>
    <input type="range" min="0" max="100" step="1" value={percentage} disabled={disabled} aria-label={label} aria-valuetext={`${percentage} %`} aria-orientation="vertical"
      title={`${label} : ${percentage} % · Glisser vers le haut ou le bas · Flèches pour ajuster`}
      onChange={(event) => onChange(Number(event.target.value))}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, y: event.clientY, value: percentage };
      }}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drag.current = null; }} />
    <span className="rotary-volume-scale" aria-hidden="true">
      <svg viewBox="0 0 64 64"><path d="M 12.2 51.8 A 28 28 0 1 1 51.8 51.8" pathLength="100" /><path className="rotary-volume-level" d="M 12.2 51.8 A 28 28 0 1 1 51.8 51.8" pathLength="100" strokeDasharray={`${percentage} 100`} /></svg>
      {Array.from({ length: 11 }, (_, index) => <i key={index} style={{ transform: `rotate(${-135 + index * 27}deg) translateY(-27px)` }} />)}
      <span className="rotary-volume-body"><i /></span>
      <small className="rotary-volume-min">0</small><small className="rotary-volume-max">10</small>
    </span>
  </span>;
}
