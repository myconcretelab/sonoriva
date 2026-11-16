import { useEffect, useState } from 'react';
import { Cable, Trash2 } from 'lucide-react';
import { isMidiVolumeTarget, midiControlLabel, midiTargetLabel, type MidiTarget } from '../lib/midi';
import type { MidiController } from '../lib/use-midi-controller';
import type { Track } from '../types';

export function MidiSettings({ midi, tracks }: { midi: MidiController; tracks: Track[] }) {
  const [target, setTarget] = useState<MidiTarget>('stop-all');
  const { learn } = midi;
  useEffect(() => () => learn(), [learn]);
  const bindings = midi.configuration.bindings.filter((binding) => binding.inputId === midi.configuration.inputId);
  return <>
    <div className="settings-section-title midi-section-title"><Cable size={16} /><div><strong>Contrôleur MIDI</strong><span>Pads, touches et potentiomètres USB. Affectations conservées sur cet appareil pour ce spectacle.</span></div></div>
    {!midi.supported ? <p className="midi-note">Ce navigateur ne propose pas l’accès MIDI. Ouvrez SonoRiva en HTTPS dans Chrome ou Edge sur ordinateur.</p> : <>
      <div className="midi-connection">
        <button type="button" className="button ghost" disabled={midi.busy} onClick={() => midi.connected ? midi.disconnect() : void midi.connect()}>{midi.busy ? 'Connexion…' : midi.connected ? 'Désactiver le MIDI' : 'Activer le MIDI'}</button>
        <span className="midi-note" role="status">{midi.connected ? midi.selectedInput ? `Connecté : ${midi.selectedInput.name ?? 'Contrôleur MIDI'}` : 'Sélectionnez une entrée MIDI.' : 'MIDI désactivé'}</span>
      </div>
      {midi.error && <p className="audio-output-error" role="alert">{midi.error}</p>}
      {midi.connected && <>
        <label className="midi-input"><span>Entrée MIDI</span><select aria-label="Entrée MIDI" value={midi.configuration.inputId} onChange={(event) => midi.selectInput(event.target.value)}>
          <option value="">Choisir le contrôleur…</option>
          {midi.configuration.inputId && !midi.selectedInput && <option value={midi.configuration.inputId}>Contrôleur déconnecté</option>}
          {midi.inputs.map((input) => <option key={input.id} value={input.id}>{input.name ?? input.manufacturer ?? 'Contrôleur MIDI'}</option>)}
        </select></label>
        {!midi.inputs.length && <p className="midi-note">Aucune entrée MIDI détectée. La liste se met à jour au branchement USB.</p>}
        {midi.selectedInput && <>
          <div className="midi-connection"><button type="button" className="button ghost" onClick={midi.applyApcPreset}>Préréglage APC Key 25 original</button><span className="midi-note">Remplace les affectations de cette entrée. Le modèle mk2 utilise des potentiomètres différents.</span></div>
          <div className="midi-learn-row">
            <label><span>Commande à affecter</span><select aria-label="Commande MIDI à affecter" value={target} onChange={(event) => { midi.learn(); setTarget(event.target.value as MidiTarget); }}>
              <optgroup label="Commandes">
                {(['stop-all', 'stop-all-immediate', 'previous-category', 'next-category', 'quick-launch', 'master-volume'] as MidiTarget[]).map((item) => <option key={item} value={item}>{midiTargetLabel(item, tracks)}</option>)}
                {Array.from({ length: 8 }, (_, index) => <option key={index} value={`playback-volume:${index}`}>Volume du lecteur nº {index + 1}</option>)}
              </optgroup>
              <optgroup label="Positions dans la catégorie">
                {Array.from({ length: 40 }, (_, index) => <option key={index} value={`slot:${index}`}>Morceau visible nº {index + 1}</option>)}
              </optgroup>
              <optgroup label="Morceaux du spectacle">
                {tracks.map((track) => <option key={track.id} value={`track:${track.id}`}>{track.title}</option>)}
              </optgroup>
            </select></label>
            <button type="button" className={`button ghost midi-learn ${midi.learning ? 'is-learning' : ''}`} aria-pressed={Boolean(midi.learning)} onClick={() => midi.learn(midi.learning ? undefined : target)}>{midi.learning ? 'Annuler l’apprentissage' : 'Apprendre une commande'}</button>
          </div>
          <p className="midi-note" role="status">{midi.learning
            ? `${isMidiVolumeTarget(midi.learning) ? 'Tournez un potentiomètre' : 'Appuyez sur un pad, une touche ou un bouton'} pour « ${midiTargetLabel(midi.learning, tracks)} ».${midi.lastMessage ? ` Reçu : ${midiControlLabel(midi.lastMessage)}.` : ''}`
            : 'Une commande apprise remplace l’affectation précédente du même contrôle. Les commandes de lecture sont suspendues pendant les réglages.'}</p>
          <details className="midi-bindings"><summary>{bindings.length} affectation{bindings.length > 1 ? 's' : ''}</summary>
            <div className="midi-binding-list">{bindings.map((binding) => <div className="midi-binding" key={`${binding.kind}:${binding.channel}:${binding.number}`}><span><strong>{midiTargetLabel(binding.target, tracks)}</strong><small>{midiControlLabel(binding)}</small></span><button type="button" className="icon-button" aria-label={`Supprimer ${midiControlLabel(binding)}`} onClick={() => midi.removeBinding(binding)}><Trash2 size={14} /></button></div>)}</div>
          </details>
        </>}
      </>}
    </>}
    <a className="midi-help" href="/docs/reference/midi.html" target="_blank" rel="noreferrer">Commandes du préréglage et limites</a>
  </>;
}
