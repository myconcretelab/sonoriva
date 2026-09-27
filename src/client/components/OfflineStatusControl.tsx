import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { bridgeClient } from '../lib/bridge-client';
import { checkServerConnection } from '../lib/connectivity';
import type { Track } from '../types';

export function OfflineStatusControl({ tracks, cachedIds }: { tracks: Track[]; cachedIds: Set<string> }) {
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
  return <div className="offline-control">
    <button type="button" className={`offline-status-button ${online === false ? 'is-offline' : ''} ${online === false && incomplete ? 'is-incomplete' : ''}`}
      onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls="offline-status-details" title={`${label} · ${count}/${tracks.length} disponibles hors ligne`}>
      {online === false ? <WifiOff size={18} /> : <Wifi size={18} />}<span>{label}</span>
    </button>
    {expanded && <div className="offline-status-details" id="offline-status-details" role="status">
      <strong>{label}</strong>
      <span>Serveur : {online === undefined ? 'vérification…' : online ? 'joignable' : 'injoignable'}</span>
      <span>{bridgeMode ? `Bridge local : ${bridgeReady === undefined ? 'vérification…' : bridgeReady ? 'joignable' : 'injoignable'}` : 'Lecture : navigateur'}</span>
      <span>{count}/{tracks.length} fichiers disponibles hors ligne</span>
      <span>{bridgeMode ? 'Audio : cache du Bridge · vidéos : navigateur' : 'Cache du navigateur'}</span>
      {incomplete && <span>Certains fichiers ou le moteur local ne sont pas disponibles.</span>}
      <small>Contrôle toutes les 5 s{checkedAt && ` · ${checkedAt}`}</small>
    </div>}
  </div>;
}
