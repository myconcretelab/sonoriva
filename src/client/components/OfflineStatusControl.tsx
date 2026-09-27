import { useEffect, useState } from 'react';
import { CircleCheck, Download, LoaderCircle, Wifi, WifiOff } from 'lucide-react';
import { bridgeClient } from '../lib/bridge-client';
import { checkServerConnection } from '../lib/connectivity';
import type { OfflinePreparation } from '../lib/prepare-offline';
import type { Track } from '../types';

interface Props {
  tracks: Track[];
  cachedIds: Set<string>;
  onPrepare: () => void;
  busy?: boolean;
  preparation?: OfflinePreparation;
}

export function OfflineStatusControl({ tracks, cachedIds, onPrepare, busy = false, preparation }: Props) {
  const [online, setOnline] = useState<boolean>();
  const [bridgeReady, setBridgeReady] = useState<boolean>();
  const [bridgeMode, setBridgeMode] = useState(bridgeClient.isEnabled());
  const [expanded, setExpanded] = useState(false);
  const [checkedAt, setCheckedAt] = useState('');
  useEffect(() => {
    let disposed = false;
    let running = false;
    let controller: AbortController | undefined;
    const check = async () => {
      if (running) return;
      running = true;
      controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]);
      const enabled = bridgeClient.isEnabled();
      const [server, local] = await Promise.all([
        checkServerConnection(signal),
        enabled ? bridgeClient.outputs().then((result) => result.outputs.length > 0, () => false) : Promise.resolve(undefined),
      ]);
      if (!disposed) {
        setOnline(server);
        setBridgeMode(bridgeClient.isEnabled());
        setBridgeReady(enabled === bridgeClient.isEnabled() ? local : undefined);
        setCheckedAt(new Date().toLocaleTimeString('fr-FR'));
      }
      running = false;
    };
    const refresh = () => { void check(); };
    const unsubscribe = bridgeClient.subscribeRouting(() => {
      setBridgeMode(bridgeClient.isEnabled());
      setBridgeReady(undefined);
      refresh();
    });
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      disposed = true;
      controller?.abort();
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const count = tracks.filter((track) => cachedIds.has(track.id)).length;
  const label = online === undefined ? 'Vérification réseau…' : online ? 'En ligne' : 'Hors ligne';
  const incomplete = count < tracks.length || (bridgeMode && bridgeReady !== true);
  const ready = tracks.length > 0 && !incomplete && !busy;
  const missing = tracks.length - count;
  return <div className="offline-control">
    <button type="button" className={`offline-status-button ${online === false ? 'is-offline' : ''} ${online === false && incomplete ? 'is-incomplete' : ''}`}
      onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls="offline-status-details" title={`${label} · ${count}/${tracks.length} disponibles hors ligne`}>
      {online === false ? <WifiOff size={18} /> : <Wifi size={18} />}<span>{label}</span>{ready && <CircleCheck size={13} className="offline-ready-mark" aria-label="Spectacle disponible hors ligne" />}
    </button>
    {expanded && <div className="offline-status-details" id="offline-status-details">
      <strong>Disponibilité hors ligne : {count}/{tracks.length}</strong>
      {ready && <span className="offline-ready-mark" role="status"><CircleCheck size={14} />Spectacle disponible hors ligne</span>}
      {tracks.length === 0 && <span>Aucun média dans ce spectacle.</span>}
      {missing > 0 && <button type="button" className="offline-prepare-button" disabled={busy} onClick={onPrepare}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
        <span>{busy ? 'Téléchargement en cours…' : `Télécharger ${missing === 1 ? 'le morceau manquant' : `les ${missing} morceaux manquants`}`}</span>
      </button>}
      {preparation?.running && <div className="offline-preparation-progress" role="status">
        <span>Préparation : {preparation.done}/{preparation.total}</span>
        <progress value={preparation.done} max={preparation.total || 1} aria-label="Préparation hors ligne" />
      </div>}
      {preparation?.error && <span className="offline-preparation-error" role="alert">{preparation.error}</span>}
      <span>Serveur : {online === undefined ? 'vérification…' : online ? 'joignable' : 'injoignable'}</span>
      <span>{bridgeMode ? `Bridge local : ${bridgeReady === undefined ? 'vérification…' : bridgeReady ? 'joignable' : 'injoignable'}` : 'Lecture : navigateur'}</span>
      <span>{count}/{tracks.length} fichiers disponibles hors ligne</span>
      <span>{bridgeMode ? 'Audio : cache du Bridge · vidéos : navigateur' : 'Cache du navigateur'}</span>
      {incomplete && <span>Certains fichiers ou le moteur local ne sont pas disponibles.</span>}
      <small>Contrôle toutes les 5 s{checkedAt && ` · ${checkedAt}`}</small>
    </div>}
  </div>;
}
