import { useEffect, useState, type CSSProperties } from 'react';
import { Volume2 } from 'lucide-react';
import { playbackVolumeAt, type ActivePlayback } from '../lib/audio-engine';
import { RotaryVolume } from './RotaryVolume';

interface Props {
  playback: ActivePlayback;
  title: string;
  rotary: boolean;
  onChange: (volume: number) => void;
}

export function PlaybackVolumeControl({ playback, title, rotary, onChange }: Props) {
  const [displayVolume, setDisplayVolume] = useState(() => playbackVolumeAt(playback));
  const { id, volume, volumeFrom, volumeTransitionDurationMs, volumeTransitionStartedAtMs } = playback;

  useEffect(() => {
    let frame: number | undefined;
    const update = () => {
      const nextVolume = playbackVolumeAt({ volume, volumeFrom, volumeTransitionDurationMs, volumeTransitionStartedAtMs });
      setDisplayVolume(nextVolume);
      if (performance.now() < volumeTransitionStartedAtMs + volumeTransitionDurationMs) frame = requestAnimationFrame(update);
    };
    update();
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [id, volume, volumeFrom, volumeTransitionDurationMs, volumeTransitionStartedAtMs]);

  const percentage = Math.round(displayVolume * 100);
  function changeVolume(value: number) {
    const nextVolume = value / 100;
    setDisplayVolume(nextVolume);
    onChange(nextVolume);
  }

  return <label className={`player-card-volume${rotary ? ' has-rotary' : ''}`}><Volume2 size={14} />{rotary
    ? <RotaryVolume value={percentage} disabled={playback.fadingOut} label={`Volume de ${title}`} onChange={changeVolume} />
    : <input type="range" min="0" max="100" value={percentage} disabled={playback.fadingOut} style={{ '--slider-progress': `${percentage}%` } as CSSProperties} onPointerUp={(event) => event.currentTarget.blur()} onPointerCancel={(event) => event.currentTarget.blur()} onChange={(event) => changeVolume(Number(event.target.value))} aria-label={`Volume de ${title}`} />
  }<em>{percentage}{rotary ? ' %' : ''}</em></label>;
}
