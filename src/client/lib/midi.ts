export type MidiTarget = 'stop-all' | 'stop-all-immediate' | 'previous-category' | 'next-category' | 'quick-launch' | 'master-volume' | `playback-volume:${number}` | `slot:${number}` | `track:${string}`;

export interface MidiMessage {
  kind: 'note' | 'cc';
  channel: number;
  number: number;
  value: number;
}

export interface MidiBinding extends Omit<MidiMessage, 'value'> {
  inputId: string;
  target: MidiTarget;
}

export interface MidiConfiguration {
  inputId: string;
  bindings: MidiBinding[];
}

export function parseMidiMessage(data: ArrayLike<number> | null): MidiMessage | undefined {
  if (!data || data.length !== 3) return;
  const [status, number, value] = Array.from(data);
  if (![status, number, value].every(Number.isInteger) || number < 0 || number > 127 || value < 0 || value > 127 || status < 0x80 || status > 0xef) return;
  const command = status & 0xf0;
  // Note Off and Note On with zero velocity both release a key.
  if (command !== 0xb0 && (command !== 0x90 || value === 0)) return;
  return { kind: command === 0xb0 ? 'cc' : 'note', channel: status & 0x0f, number, value };
}

export function isMidiVolumeTarget(target: MidiTarget): boolean {
  return target === 'master-volume' || target.startsWith('playback-volume:');
}

function isMidiTarget(value: unknown): value is MidiTarget {
  return typeof value === 'string' && (
    ['stop-all', 'stop-all-immediate', 'previous-category', 'next-category', 'quick-launch', 'master-volume'].includes(value)
    || /^playback-volume:[0-7]$/.test(value)
    || /^slot:([0-9]|[1-3][0-9])$/.test(value)
    || (value.startsWith('track:') && value.length > 6 && value.length < 256)
  );
}

export function sameMidiControl(first: Omit<MidiBinding, 'target'>, second: Omit<MidiBinding, 'target'>): boolean {
  return first.inputId === second.inputId && first.kind === second.kind && first.channel === second.channel && first.number === second.number;
}

export function bindMidiControl(bindings: MidiBinding[], binding: MidiBinding): MidiBinding[] {
  return [...bindings.filter((current) => !sameMidiControl(current, binding)), binding];
}

export function readMidiConfiguration(serialized: string | null): MidiConfiguration {
  const empty: MidiConfiguration = { inputId: '', bindings: [] };
  try {
    const value = JSON.parse(serialized ?? 'null');
    if (!value || typeof value !== 'object') return empty;
    const bindings = Array.isArray(value.bindings) ? value.bindings : [];
    for (const binding of bindings.slice(0, 512)) {
      if (!binding || typeof binding !== 'object' || typeof binding.inputId !== 'string' || !binding.inputId
        || !['note', 'cc'].includes(binding.kind) || !Number.isInteger(binding.channel) || binding.channel < 0 || binding.channel > 15
        || !Number.isInteger(binding.number) || binding.number < 0 || binding.number > 127 || !isMidiTarget(binding.target)
        || (isMidiVolumeTarget(binding.target) && binding.kind !== 'cc')) continue;
      empty.bindings = bindMidiControl(empty.bindings, { inputId: binding.inputId, kind: binding.kind, channel: binding.channel, number: binding.number, target: binding.target });
    }
    empty.inputId = typeof value.inputId === 'string' ? value.inputId : '';
    return empty;
  } catch { return empty; }
}

export function apcKey25Bindings(inputId: string): MidiBinding[] {
  const binding = (kind: 'note' | 'cc', number: number, target: MidiTarget): MidiBinding => ({ inputId, kind, channel: 0, number, target });
  // Original APC Key 25: grid notes run from bottom left to top right.
  // This preset uses absolute knobs; the mk2's relative encoders differ.
  return [
    ...Array.from({ length: 40 }, (_, slot) => binding('note', (4 - Math.floor(slot / 8)) * 8 + slot % 8, `slot:${slot}`)),
    binding('note', 81, 'stop-all'),
    binding('note', 66, 'previous-category'),
    binding('note', 67, 'next-category'),
    binding('note', 91, 'quick-launch'),
    binding('cc', 48, 'master-volume'),
    ...Array.from({ length: 7 }, (_, index) => binding('cc', 49 + index, `playback-volume:${index}`)),
  ];
}

export function midiControlLabel(message: Pick<MidiMessage, 'kind' | 'channel' | 'number'>): string {
  return `${message.kind === 'note' ? 'Note' : 'CC'} ${message.number} · canal ${message.channel + 1}`;
}

export function midiTargetLabel(target: MidiTarget, tracks: { id: string; title: string }[]): string {
  if (target.startsWith('track:')) return tracks.find((track) => track.id === target.slice(6))?.title ?? 'Morceau supprimé';
  if (target.startsWith('slot:')) return `Morceau visible nº ${Number(target.slice(5)) + 1}`;
  if (target.startsWith('playback-volume:')) return `Volume du lecteur nº ${Number(target.slice(16)) + 1}`;
  const labels: Partial<Record<MidiTarget, string>> = {
    'stop-all': 'Tout arrêter avec les fondus',
    'stop-all-immediate': 'Tout arrêter immédiatement',
    'previous-category': 'Catégorie précédente',
    'next-category': 'Catégorie suivante',
    'quick-launch': 'Lancer le départ rapide',
    'master-volume': 'Volume maître',
  };
  return labels[target] ?? target;
}
