import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { apcKey25Bindings, bindMidiControl, isMidiVolumeTarget, parseMidiMessage, readMidiConfiguration, sameMidiControl, type MidiBinding, type MidiConfiguration, type MidiMessage, type MidiTarget } from './midi';

export function useMidiController(scope: string, onCommand: (target: MidiTarget, value: number) => void) {
  const key = `sonoriva-midi:${scope}`;
  const initial = useMemo(() => readMidiConfiguration(localStorage.getItem(key)), [key]);
  const [stored, setStored] = useState({ key, value: initial });
  const configuration = stored.key === key ? stored.value : initial;
  const [access, setAccess] = useState<MIDIAccess>();
  const [inputs, setInputs] = useState<MIDIInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [learning, setLearning] = useState<MidiTarget>();
  const [lastMessage, setLastMessage] = useState<MidiMessage>();
  const generation = useRef(0);
  const commandRef = useRef(onCommand);
  const learningRef = useRef(learning);
  const supported = typeof navigator.requestMIDIAccess === 'function';
  useLayoutEffect(() => { commandRef.current = onCommand; learningRef.current = learning; });

  const update = useCallback((change: (current: MidiConfiguration) => MidiConfiguration) => {
    setStored((previous) => ({ key, value: change(previous.key === key ? previous.value : initial) }));
  }, [initial, key]);

  useEffect(() => {
    if (stored.key === key) localStorage.setItem(key, JSON.stringify(stored.value));
  }, [key, stored]);

  const disconnect = useCallback(() => {
    generation.current += 1;
    setAccess(undefined);
    setInputs([]);
    setLearning(undefined);
    learningRef.current = undefined;
    setLastMessage(undefined);
    setBusy(false);
  }, []);

  // A different user or show requires an explicit connection, too.
  useEffect(() => { disconnect(); return () => { generation.current += 1; }; }, [key, disconnect]);

  const connect = useCallback(async () => {
    if (!supported) return;
    const request = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const midi = await navigator.requestMIDIAccess({ sysex: false });
      if (generation.current === request) setAccess(midi);
    } catch (cause) {
      if (generation.current === request) setError(cause && typeof cause === 'object' && 'name' in cause && cause.name === 'NotAllowedError'
        ? 'Accès MIDI refusé. L’autorisation se règle dans les permissions du navigateur.'
        : 'Connexion MIDI impossible. Vérifiez la connexion USB du contrôleur.');
    } finally {
      if (generation.current === request) setBusy(false);
    }
  }, [supported]);

  useEffect(() => {
    if (!access) return;
    const refresh = () => {
      setInputs([...access.inputs.values()].filter((input) => input.state === 'connected'));
      setLearning(undefined);
      learningRef.current = undefined;
      setLastMessage(undefined);
    };
    refresh();
    access.addEventListener('statechange', refresh);
    return () => access.removeEventListener('statechange', refresh);
  }, [access]);

  useEffect(() => {
    const input = inputs.find((item) => item.id === configuration.inputId);
    if (!input) return;
    const onMessage = (event: MIDIMessageEvent) => {
      const message = parseMidiMessage(event.data);
      if (!message) return;
      const target = learningRef.current;
      if (target) {
        setLastMessage(message);
        if (isMidiVolumeTarget(target) && message.kind !== 'cc') return;
        // CC zero is a release for buttons; it remains a valid volume value.
        if (!isMidiVolumeTarget(target) && message.value === 0) return;
        learningRef.current = undefined;
        setLearning(undefined);
        const { kind, channel, number } = message;
        update((current) => ({ ...current, bindings: bindMidiControl(current.bindings, { kind, channel, number, inputId: input.id, target }) }));
        return;
      }
      const binding = configuration.bindings.find((item) => sameMidiControl(item, { ...message, inputId: input.id }));
      if (binding && (isMidiVolumeTarget(binding.target) || message.value > 0)) commandRef.current(binding.target, message.value / 127);
    };
    input.addEventListener('midimessage', onMessage);
    return () => input.removeEventListener('midimessage', onMessage);
  }, [configuration, inputs, update]);

  const selectInput = (inputId: string) => {
    setLearning(undefined);
    learningRef.current = undefined;
    setLastMessage(undefined);
    update((current) => ({ ...current, inputId }));
  };
  const learn = useCallback((target?: MidiTarget) => {
    setLastMessage(undefined);
    learningRef.current = target;
    setLearning(target);
  }, []);
  const applyApcPreset = () => {
    if (!configuration.inputId) return;
    learn();
    update((current) => ({ ...current, bindings: [...current.bindings.filter((item) => item.inputId !== current.inputId), ...apcKey25Bindings(current.inputId)] }));
  };
  const removeBinding = (binding: MidiBinding) => update((current) => ({ ...current, bindings: current.bindings.filter((item) => !sameMidiControl(item, binding)) }));
  const selectedInput = inputs.find((input) => input.id === configuration.inputId);
  return { supported, connected: Boolean(access), busy, error, inputs, selectedInput, configuration, learning, lastMessage, connect, disconnect, selectInput, learn, applyApcPreset, removeBinding };
}

export type MidiController = ReturnType<typeof useMidiController>;
