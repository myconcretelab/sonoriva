import { resolveEntityConflict } from '../lib/entity-sync';
import { entityKey } from '../lib/entity-journal';
import { desktopHost } from '../lib/desktop';
import { useEffect, useState } from 'react';
import { CircleCheck, Download, LoaderCircle, RefreshCcw, Wifi, WifiOff } from 'lucide-react';
import { bridgeClient } from '../lib/bridge-client';
import { checkServerConnection } from '../lib/connectivity';
import type { OfflinePreparation } from '../lib/prepare-offline';
import type { Track } from '../types';
import { appOfflineStatus } from '../lib/app-offline';
import { localUser, resolveLocalConflict, synchronizeWorkspaces, workspaceSyncStatus } from '../lib/local-workspace';

interface Props {
  projectId?: string;
  tracks: Track[];
  cachedIds: Set<string>;
  onPrepare: () => void;
  busy?: boolean;
  preparation?: OfflinePreparation;
}

export function OfflineStatusControl({ projectId, tracks, cachedIds, onPrepare, busy = false, preparation }: Props) {
  const [appReady, setAppReady] = useState(import.meta.env.DEV);
  const [sync, setSync] = useState<Awaited<ReturnType<typeof workspaceSyncStatus>>>({ pending: [], entities: [], syncing: false });
  const [online, setOnline] = useState<boolean>();
  const [bridgeReady, setBridgeReady] = useState<boolean>();
  const [bridgeMode, setBridgeMode] = useState(bridgeClient.isEnabled());
  const [localConsoleAvailable, setLocalConsoleAvailable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [checkedAt, setCheckedAt] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolutionError, setResolutionError] = useState('');
  async function resolveStructure(key: string, keepLocal: boolean) {
    const user = localUser();
    if (!user || !projectId) return;
    setResolving(true); setResolutionError('');
    try {
      await resolveEntityConflict(user.id, projectId, key, keepLocal);
      await synchronizeWorkspaces(true);
    } catch (cause) { setResolutionError(cause instanceof Error ? cause.message : 'Enregistrement impossible.'); }
    finally { setResolving(false); }
  }
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void appOfflineStatus().then((status) => { if (!disposed) setAppReady(status.ready); });
      void workspaceSyncStatus(projectId).then((status) => { if (!disposed) setSync(status); }).catch(() => undefined);
    };
    refresh();
    window.addEventListener('sonoriva:local-workspace-changed', refresh);
    navigator.serviceWorker?.addEventListener('controllerchange', refresh);
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      disposed = true;
      window.removeEventListener('sonoriva:local-workspace-changed', refresh);
      navigator.serviceWorker?.removeEventListener('controllerchange', refresh);
      window.clearInterval(timer);
    };
  }, [projectId]);
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
      const [server, local, consoleAvailable] = await Promise.all([
        checkServerConnection(signal),
        enabled ? bridgeClient.outputs().then((result) => result.outputs.length > 0, () => false) : Promise.resolve(undefined),
        enabled && !desktopHost() ? (bridgeClient.discover?.(signal) ?? Promise.resolve(undefined)).then((status) => status?.capabilities?.includes('localConsole') ?? false, () => false) : Promise.resolve(false),
      ]);
      if (!disposed) {
        setOnline(server);
        setLocalConsoleAvailable(consoleAvailable);
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
  const pendingCount = sync.pending.length + (sync.entities?.length ?? 0);
  const count = tracks.filter((track) => cachedIds.has(track.id)).length;
  const label = online === undefined ? 'Vérification réseau…' : online ? 'En ligne' : 'Hors ligne';
  const incomplete = !appReady || count < tracks.length || (bridgeMode && bridgeReady !== true);
  const ready = tracks.length > 0 && !incomplete && !busy;
  const missing = tracks.length - count;
  return <div className="offline-control">
    <button type="button" className={`offline-status-button ${online === false ? 'is-offline' : ''} ${online === false && incomplete ? 'is-incomplete' : ''}`}
      onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls="offline-status-details" title={`${label} · ${count}/${tracks.length} disponibles hors ligne${pendingCount ? ` · ${pendingCount} changement${pendingCount > 1 ? 's' : ''} à synchroniser` : ''}`}>
      {online === false ? <WifiOff size={18} /> : <Wifi size={18} />}<span>{label}</span>{pendingCount > 0 ? <RefreshCcw size={13} className={sync.syncing ? 'spin' : ''} aria-label={`${pendingCount} changement${pendingCount > 1 ? 's' : ''} à synchroniser`} /> : ready && <CircleCheck size={13} className="offline-ready-mark" aria-label="Spectacle disponible hors ligne" />}
    </button>
    {expanded && <div className="offline-status-details" id="offline-status-details">
      <strong>Disponibilité hors ligne : {count}/{tracks.length}</strong>
      {ready && <span className="offline-ready-mark" role="status"><CircleCheck size={14} />Spectacle disponible hors ligne</span>}
      <span>Application : {appReady ? 'disponible hors ligne' : 'à préparer'}</span>
      {tracks.length === 0 && <span>Aucun média dans ce spectacle.</span>}
      {(missing > 0 || !appReady) && <button type="button" className="offline-prepare-button" disabled={busy} onClick={onPrepare}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
        <span>{busy ? 'Téléchargement en cours…' : missing > 0 ? `Télécharger ${missing === 1 ? 'le morceau manquant' : `les ${missing} morceaux manquants`}` : 'Préparer l’application'}</span>
      </button>}
      {bridgeMode && localConsoleAvailable && !desktopHost() && !busy && <button type="button" className="offline-prepare-button" onClick={onPrepare}><Download size={16} />Préparer la régie locale</button>}
      {preparation?.running && <div className="offline-preparation-progress" role="status">
        <span>Préparation : {preparation.done}/{preparation.total}</span>
        <progress value={preparation.done} max={preparation.total || 1} aria-label="Préparation hors ligne" />
      </div>}
      {preparation?.error && <span className="offline-preparation-error" role="alert">{preparation.error}</span>}
      {pendingCount > 0 && <>
        <strong role="status">{pendingCount} changement{pendingCount > 1 ? 's' : ''} conservé{pendingCount > 1 ? 's' : ''} sur cet appareil</strong>
        <button type="button" className="offline-prepare-button" disabled={sync.syncing || online !== true} onClick={() => { void synchronizeWorkspaces(true); }}>
          {sync.syncing ? <LoaderCircle className="spin" size={16} /> : <RefreshCcw size={16} />}{sync.syncing ? 'Synchronisation…' : 'Synchroniser'}
        </button>
        <div className="offline-sync-list">{sync.pending.filter((item) => item.error).map((item) => <div key={item.desired.id}>
          <strong>{item.desired.title}</strong><span className="offline-preparation-error" role="alert">{item.error}</span>
          {item.remote && projectId && <>
            <button type="button" className="offline-prepare-button" disabled={sync.syncing} onClick={() => { void resolveLocalConflict(projectId, item.desired.id, true); }}>Garder mes changements</button>
            <button type="button" className="offline-prepare-button" disabled={sync.syncing} onClick={() => {
              if (window.confirm(`Remplacer les changements locaux de « ${item.desired.title} » par la version en ligne ?`)) void resolveLocalConflict(projectId, item.desired.id, false);
            }}>Utiliser la version en ligne</button>
          </>}
        </div>)}
        {(sync.entities ?? []).filter((item) => item.error).map((item) => <div key={entityKey(item.kind, item.id)}>
          <strong>{item.kind === 'category' ? 'Catégorie' : 'Playlist'} : {item.label}</strong><span className="offline-preparation-error" role="alert">{item.error}</span>
          {item.remote !== undefined && projectId && <>
            <button type="button" className="offline-prepare-button" disabled={sync.syncing || resolving} onClick={() => {
              if (!item.desired && !window.confirm(`Confirmer la suppression de « ${item.label} » malgré les changements en ligne ?`)) return;
              void resolveStructure(entityKey(item.kind, item.id), true);
            }}>{item.desired ? 'Garder mes changements' : 'Confirmer la suppression'}</button>
            <button type="button" className="offline-prepare-button" disabled={sync.syncing || resolving} onClick={() => {
              if (window.confirm(`Remplacer les changements locaux de « ${item.label} » par la version en ligne ?`)) void resolveStructure(entityKey(item.kind, item.id), false);
            }}>Utiliser la version en ligne</button>
          </>}
        </div>)}</div>
      </>}
      {resolutionError && <span className="offline-preparation-error" role="alert">{resolutionError}</span>}
      <span>Serveur : {online === undefined ? 'vérification…' : online ? 'joignable' : 'injoignable'}</span>
      <span>{bridgeMode ? `Bridge local : ${bridgeReady === undefined ? 'vérification…' : bridgeReady ? 'joignable' : 'injoignable'}` : 'Lecture : navigateur'}</span>
      <span>{count}/{tracks.length} fichiers disponibles hors ligne</span>
      <span>{desktopHost() ? 'Fichiers et changements : disque du Bridge' : bridgeMode ? 'Audio : cache du Bridge · vidéos : navigateur' : 'Cache du navigateur'}</span>
      {!desktopHost() && bridgeMode && tracks.some((track) => track.localMedia) && <span>Les fichiers importés sur cet appareil utilisent la sortie du navigateur.</span>}
      {incomplete && <span>Certains fichiers ou le moteur local ne sont pas disponibles.</span>}
      <small>Contrôle toutes les 5 s{checkedAt && ` · ${checkedAt}`}</small>
    </div>}
  </div>;
}
