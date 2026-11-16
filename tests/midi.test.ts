// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apcKey25Bindings, bindMidiControl, midiTargetLabel, parseMidiMessage, readMidiConfiguration, type MidiBinding } from '../src/client/lib/midi';
import { useMidiController } from '../src/client/lib/use-midi-controller';
import { MidiSettings } from '../src/client/components/MidiSettings';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

class Input extends EventTarget {
  id = 'akai';
  name = 'APC Key 25';
  state = 'connected';
  send(data: number[]) {
    const event = new Event('midimessage');
    Object.defineProperty(event, 'data', { value: new Uint8Array(data) });
    this.dispatchEvent(event);
  }
}

function setup(request?: () => Promise<MIDIAccess>, withSettings = false) {
  const input = new Input();
  const access = Object.assign(new EventTarget(), { inputs: new Map([['akai', input]]) });
  const requestMidi = vi.fn(request ?? (async () => access as unknown as MIDIAccess));
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: requestMidi });
  cleanups.push(() => { Reflect.deleteProperty(navigator, 'requestMIDIAccess'); });
  const command = vi.fn();
  let current: ReturnType<typeof useMidiController>;
  function Harness({ scope }: { scope: string }) {
    current = useMidiController(scope, command);
    return withSettings ? createElement(MidiSettings, { midi: current, tracks: [] }) : null;
  }
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  const render = (scope: string) => act(() => root.render(createElement(Harness, { scope })));
  render('user:show');
  cleanups.push(() => { act(() => root.unmount()); element.remove(); });
  return {
    get midi() { return current!; }, input, access, requestMidi, command, render, element,
    async connect() { await act(() => current.connect()); act(() => current.selectInput('akai')); },
    send(data: number[]) { act(() => input.send(data)); },
  };
}

describe('messages et affectations MIDI', () => {
  it('distingue notes, canaux et CC et ignore relâchements, horloge et messages incomplets', () => {
    expect(parseMidiMessage([0x91, 36, 100])).toEqual({ kind: 'note', channel: 1, number: 36, value: 100 });
    expect(parseMidiMessage([0xbf, 48, 0])).toEqual({ kind: 'cc', channel: 15, number: 48, value: 0 });
    for (const data of [null, [], [0x90, 36], [0x80, 36, 127], [0x90, 36, 0], [0xf8], [0xe0, 0, 64], [0x90, 128, 1], [0x90, 20, -1], [0x190, 1, 2]]) expect(parseMidiMessage(data)).toBeUndefined();
  });

  it('remplace un contrôle sans confondre les canaux, les types ou les entrées', () => {
    const note: MidiBinding = { inputId: 'a', kind: 'note', channel: 0, number: 10, target: 'stop-all' };
    const bindings = [note, { ...note, channel: 1 }, { ...note, kind: 'cc' as const }, { ...note, inputId: 'b' }];
    expect(bindMidiControl(bindings, { ...note, target: 'next-category' })).toEqual([...bindings.slice(1), { ...note, target: 'next-category' }]);
  });

  it('restaure les affectations valides sans accepter de notes de volume ou des cibles corrompues', () => {
    expect(readMidiConfiguration('{')).toEqual({ inputId: '', bindings: [] });
    const valid = { inputId: 'akai', kind: 'cc', channel: 0, number: 48, target: 'master-volume' };
    const restored = readMidiConfiguration(JSON.stringify({ inputId: 'akai', bindings: [null, valid, { ...valid, kind: 'note' }, { ...valid, channel: 16 }, { ...valid, target: 'slot:40' }, { ...valid, target: 'playback-volume:8' }, { ...valid, number: 49, target: 'track:sound' }] }));
    expect(restored.bindings).toEqual([valid, { ...valid, number: 49, target: 'track:sound' }]);
  });

  it('oriente les pads APC depuis le coin supérieur gauche et couvre les commandes physiques', () => {
    const bindings = apcKey25Bindings('akai');
    for (const [number, target] of [[32, 'slot:0'], [39, 'slot:7'], [0, 'slot:32'], [7, 'slot:39'], [81, 'stop-all'], [66, 'previous-category'], [67, 'next-category'], [91, 'quick-launch']] as const) {
      expect(bindings).toContainEqual({ inputId: 'akai', kind: 'note', channel: 0, number, target });
    }
    expect(bindings.find((binding) => binding.kind === 'cc' && binding.number === 48)?.target).toBe('master-volume');
    expect(bindings.find((binding) => binding.kind === 'cc' && binding.number === 55)?.target).toBe('playback-volume:6');
    expect(midiTargetLabel('playback-volume:6', [])).toBe('Volume du lecteur nº 7');
  });
});

describe('connexion et apprentissage MIDI', () => {
  it('demande l’autorisation uniquement sur activation et écoute seulement l’entrée choisie', async () => {
    const view = setup();
    expect(view.requestMidi).not.toHaveBeenCalled();
    await act(() => view.midi.connect());
    act(() => view.midi.applyApcPreset());
    view.send([0x90, 32, 127]);
    expect(view.command).not.toHaveBeenCalled();
    act(() => view.midi.selectInput('akai'));
    act(() => view.midi.applyApcPreset());
    view.send([0x90, 32, 127]);
    expect(view.command).toHaveBeenCalledWith('slot:0', 1);
    view.send([0x91, 32, 127]);
    view.send([0x90, 32, 0]);
    view.send([0x80, 32, 127]);
    expect(view.command).toHaveBeenCalledTimes(1);
    expect(view.requestMidi).toHaveBeenCalledWith({ sysex: false });
  });

  it('apprend une touche de piano sans la jouer et enregistre son canal', async () => {
    const view = setup(); await view.connect();
    act(() => view.midi.learn('track:rain'));
    view.send([0x91, 60, 110]);
    expect(view.midi.learning).toBeUndefined();
    expect(view.command).not.toHaveBeenCalled();
    expect(view.midi.configuration.bindings[0]).toMatchObject({ inputId: 'akai', kind: 'note', channel: 1, number: 60, target: 'track:rain' });
    view.send([0x91, 60, 90]);
    expect(view.command).toHaveBeenCalledWith('track:rain', 90 / 127);
  });

  it('préserve le mode apprentissage dans les paramètres malgré les rendus', async () => {
    const view = setup(undefined, true); await view.connect();
    act(() => view.element.querySelector<HTMLButtonElement>('.midi-learn')!.click());
    expect(view.midi.learning).toBe('stop-all');
    view.render('user:show');
    expect(view.midi.learning).toBe('stop-all');
    view.send([0x90, 10, 127]);
    expect(view.midi.configuration.bindings[0]?.target).toBe('stop-all');
    expect(view.command).not.toHaveBeenCalled();
  });

  it('attend un CC pour les volumes et transmet aussi le zéro', async () => {
    const view = setup(); await view.connect();
    act(() => view.midi.learn('master-volume'));
    view.send([0x90, 20, 127]);
    expect(view.midi.learning).toBe('master-volume');
    view.send([0xb0, 48, 64]);
    expect(view.command).not.toHaveBeenCalled();
    view.send([0xb0, 48, 0]);
    view.send([0xb0, 48, 127]);
    expect(view.command.mock.calls).toEqual([['master-volume', 0], ['master-volume', 1]]);
  });

  it('ignore les relâchements de boutons CC et les distingue des potentiomètres', async () => {
    const view = setup(); await view.connect();
    act(() => view.midi.learn('stop-all-immediate'));
    view.send([0xb0, 40, 0]);
    expect(view.midi.learning).toBe('stop-all-immediate');
    view.send([0xb0, 40, 127]);
    view.send([0xb0, 40, 0]);
    expect(view.command).not.toHaveBeenCalled();
    view.send([0xb0, 40, 127]);
    expect(view.command).toHaveBeenCalledOnce();
  });

  it('suspend les commandes au débranchement et rétablit une seule écoute au rebranchement', async () => {
    const view = setup(); await view.connect();
    act(() => view.midi.applyApcPreset());
    act(() => { view.input.state = 'disconnected'; view.access.dispatchEvent(new Event('statechange')); });
    view.send([0x90, 32, 127]);
    expect(view.command).not.toHaveBeenCalled();
    expect(view.midi.selectedInput).toBeUndefined();
    act(() => { view.input.state = 'connected'; view.access.dispatchEvent(new Event('statechange')); });
    view.send([0x90, 32, 127]);
    expect(view.command).toHaveBeenCalledOnce();
    act(() => view.midi.disconnect());
    view.send([0x90, 32, 127]);
    expect(view.command).toHaveBeenCalledOnce();
    expect(view.midi.configuration.bindings.length).toBeGreaterThan(40);
  });

  it('sépare utilisateurs et spectacles, puis restaure les affectations sans se reconnecter', async () => {
    const view = setup(); await view.connect();
    act(() => view.midi.applyApcPreset());
    view.render('other:show');
    expect(view.midi.connected).toBe(false);
    expect(view.midi.configuration.bindings).toEqual([]);
    view.send([0x90, 32, 127]);
    expect(view.command).not.toHaveBeenCalled();
    view.render('user:show');
    expect(view.midi.configuration.bindings).toEqual(apcKey25Bindings('akai'));
    expect(view.midi.connected).toBe(false);
  });

  it('ignore une autorisation tardive après un changement de spectacle', async () => {
    let finish!: (access: MIDIAccess) => void;
    const view = setup(() => new Promise((resolve) => { finish = resolve; }));
    let pending!: Promise<void>;
    act(() => { pending = view.midi.connect(); });
    view.render('user:other-show');
    await act(async () => { finish(view.access as unknown as MIDIAccess); await pending; });
    expect(view.midi.connected).toBe(false);
    expect(view.midi.busy).toBe(false);
  });

  it('affiche le refus d’autorisation et permet de réessayer', async () => {
    const view = setup(async () => { throw new DOMException('Denied', 'NotAllowedError'); });
    await act(() => view.midi.connect());
    expect(view.midi.error).toContain('Accès MIDI refusé');
    expect(view.midi.busy).toBe(false);
    expect(view.midi.connected).toBe(false);
    view.requestMidi.mockResolvedValueOnce(view.access as unknown as MIDIAccess);
    await view.connect();
    expect(view.midi.error).toBe('');
    expect(view.midi.connected).toBe(true);
  });
});
