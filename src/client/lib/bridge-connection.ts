import { api } from './api';
import { bridgeClient, type AudioPlaybackMode } from './bridge-client';

export type BridgeConnectionState = 'unavailable' | 'checking' | 'offline' | 'detected' | 'ready' | 'active';
export type BridgeConnectionAction = 'none' | 'pair' | 'open' | 'activate' | 'deactivate';

export interface BridgeConnectionView {
  state: BridgeConnectionState;
  label: string;
  action: BridgeConnectionAction;
  actionLabel: string;
}

export function bridgeConnectionView(input: {
  available: boolean | undefined;
  detected: boolean | undefined;
  associated: boolean;
  mode: AudioPlaybackMode;
}): BridgeConnectionView {
  if (input.available === false) return { state: 'unavailable', label: 'Bridge réservé aux forfaits payants', action: 'none', actionLabel: 'Bridge indisponible' };
  if ((input.available === undefined && !input.associated) || input.detected === undefined) return { state: 'checking', label: 'Détection du Bridge…', action: 'none', actionLabel: 'Détection en cours' };
  if (!input.detected && input.associated) return { state: 'offline', label: 'Bridge associé mais fermé', action: 'open', actionLabel: 'Ouvrir et activer le Bridge' };
  if (!input.detected) return { state: 'offline', label: 'Bridge non détecté', action: 'pair', actionLabel: 'Ouvrir et associer le Bridge' };
  if (!input.associated) return { state: 'detected', label: 'Bridge détecté, association requise', action: 'pair', actionLabel: 'Associer le Bridge' };
  if (input.mode !== 'bridge') return { state: 'ready', label: 'Bridge prêt', action: 'activate', actionLabel: 'Activer le Bridge' };
  return { state: 'active', label: 'Bridge actif', action: 'deactivate', actionLabel: 'Revenir au moteur Navigateur' };
}

export async function associateLocalBridge(onProgress?: (message: string) => void): Promise<void> {
  const pairing = await api.createBridgePairing();
  const link = new URL('sonoriva-bridge://pair');
  link.searchParams.set('ticket', pairing.ticket);
  if (window.location.origin !== 'https://app.sonoriva.fr') link.searchParams.set('server', window.location.origin);
  onProgress?.('Ouverture de SonoRiva Bridge…');
  window.location.href = link.toString();

  const expiresAt = new Date(pairing.expiresAt).getTime();
  while (Date.now() < expiresAt) {
    await new Promise((resolve) => window.setTimeout(resolve, 750));
    const status = await api.bridgePairingStatus(pairing.ticket);
    if (status.status === 'pending') continue;
    if (status.status === 'paired') {
      bridgeClient.saveAssociation(status.deviceId, status.localToken);
      return;
    }
    throw new Error('Cette association a déjà été récupérée. Relancez la connexion.');
  }
  throw new Error('Le lien d’association a expiré. Relancez la connexion.');
}

export function openLocalBridge(): void {
  window.location.href = 'sonoriva-bridge://open';
}
