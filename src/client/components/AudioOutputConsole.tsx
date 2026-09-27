import { useCallback, useEffect, useRef, useState } from 'react';
import { Cable, LoaderCircle, Power, RefreshCcw } from 'lucide-react';
import { audioEngine } from '../lib/audio-engine';
import { bridgeClient, isBridgeUnavailableError } from '../lib/bridge-client';
import { associateLocalBridge, bridgeConnectionView, openLocalBridge } from '../lib/bridge-connection';
import { bridgePhysicalOutputs, playbackBridgeOutput, routableBridgeOutputs, supportsPerPlaybackOutput, type RoutedBridgeOutput } from '../lib/bridge-output-routing';

interface Props {
  bridgeAvailable: boolean | undefined;
  onError: (message: string) => void;
  onRoutingChange: (outputs: RoutedBridgeOutput[], mainOutputId: string | undefined) => void;
}

export function AudioOutputConsole({ bridgeAvailable, onError, onRoutingChange }: Props) {
  const [outputs, setOutputs] = useState<RoutedBridgeOutput[]>([]);
  const [mainOutputId, setMainOutputId] = useState<string>();
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [outputBusy, setOutputBusy] = useState<string>();
  const [bridgeDetected, setBridgeDetected] = useState<boolean>();
  const refreshSequence = useRef(0);

  const clearOutputs = useCallback(() => {
    setOutputs([]);
    setMainOutputId(undefined);
    onRoutingChange([], undefined);
  }, [onRoutingChange]);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    if (bridgeAvailable === false || (bridgeAvailable === undefined && !bridgeClient.isAssociated())) {
      setBridgeDetected(undefined);
      clearOutputs();
      return false;
    }
    try {
      const status = await bridgeClient.discover(AbortSignal.timeout(3000));
      if (sequence !== refreshSequence.current) return true;
      setBridgeDetected(true);
      if (!bridgeClient.isAssociated()) {
        clearOutputs();
        return true;
      }
      const result = await bridgeClient.outputs();
      if (sequence !== refreshSequence.current) return true;
      const physicalOutputs = bridgePhysicalOutputs(result.outputs);
      const selectedId = playbackBridgeOutput(physicalOutputs, result.mainOutputId)?.id;
      setOutputs(physicalOutputs);
      setMainOutputId(selectedId);
      const routableOutputs = routableBridgeOutputs(result.outputs, supportsPerPlaybackOutput(status));
      onRoutingChange(routableOutputs, playbackBridgeOutput(routableOutputs, result.mainOutputId)?.id);
      return true;
    } catch (cause) {
      if (sequence !== refreshSequence.current) return false;
      if (isBridgeUnavailableError(cause)) bridgeClient.fallbackToBrowser();
      setBridgeDetected(false);
      clearOutputs();
      return false;
    }
  }, [bridgeAvailable, clearOutputs, onRoutingChange]);

  useEffect(() => audioEngine.subscribeRouting(() => { refresh().catch(() => undefined); }), [refresh]);

  useEffect(() => {
    if (bridgeAvailable === false || (bridgeAvailable === undefined && !bridgeClient.isAssociated())) return;
    const timer = window.setInterval(() => refresh().catch(() => undefined), 5_000);
    return () => window.clearInterval(timer);
  }, [bridgeAvailable, refresh]);

  async function changeOutput(deviceId: string) {
    if (outputBusy || deviceId === mainOutputId) return;
    setOutputBusy(deviceId);
    try {
      await bridgeClient.setOutput('main', deviceId);
      await refresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Impossible de sélectionner cette sortie audio.');
      await refresh();
    } finally {
      setOutputBusy(undefined);
    }
  }

  async function runBridgeAction() {
    if (bridgeBusy) return;
    const connection = bridgeConnectionView({
      available: bridgeAvailable,
      detected: bridgeDetected,
      associated: bridgeClient.isAssociated(),
      mode: audioEngine.getPlaybackMode(),
    });
    if (connection.action === 'none') return;
    setBridgeBusy(true);
    try {
      if (connection.action === 'pair') {
        await associateLocalBridge();
        setBridgeDetected(true);
        audioEngine.setPlaybackMode('bridge');
      } else if (connection.action === 'open') {
        openLocalBridge();
        let detected = false;
        for (let attempt = 0; attempt < 20 && !detected; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          detected = await refresh();
        }
        if (!detected) throw new Error('SonoRiva Bridge ne répond pas sur cette machine.');
        audioEngine.setPlaybackMode('bridge');
      } else if (connection.action === 'activate') {
        audioEngine.setPlaybackMode('bridge');
      } else {
        audioEngine.setPlaybackMode('browser');
      }
      await refresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Impossible de connecter SonoRiva Bridge.');
      await refresh();
    } finally {
      setBridgeBusy(false);
    }
  }

  const bridgeConnection = bridgeConnectionView({
    available: bridgeAvailable,
    detected: bridgeDetected,
    associated: bridgeClient.isAssociated(),
    mode: audioEngine.getPlaybackMode(),
  });

  return <section className={`bridge-output-strip bridge-output-console ${bridgeConnection.state}`} aria-label="Gestion des sorties audio">
    <strong>Sorties audio</strong>
    <div className="bridge-output-list">
      {outputs.map((output) => <button type="button" className={output.id === mainOutputId ? 'is-main' : ''} style={{ '--output-color': output.color } as React.CSSProperties} key={output.id} disabled={Boolean(outputBusy)} onClick={() => changeOutput(output.id)} aria-pressed={output.id === mainOutputId} aria-label={output.id === mainOutputId ? `${output.name} · sortie principale` : `Définir ${output.name} comme sortie principale`} title={output.id === mainOutputId ? `${output.name} · sortie principale` : `Utiliser ${output.name} comme sortie principale`}>
        {outputBusy === output.id ? <LoaderCircle className="spin" size={12} /> : <i />}
        <b>{output.name}</b>{output.id === mainOutputId && <em>Principale</em>}
      </button>)}
      {outputs.length === 0 && <small>{bridgeConnection.label}</small>}
    </div>
    <div className="bridge-output-actions">
      <i className={`bridge-status-led ${bridgeConnection.state}`} role="status" aria-label={bridgeConnection.label} title={bridgeConnection.label} />
      <button type="button" className={bridgeConnection.state === 'active' ? 'active' : ''} disabled={bridgeBusy || bridgeConnection.action === 'none'} onClick={runBridgeAction} aria-label={bridgeConnection.actionLabel} title={bridgeConnection.actionLabel}>{bridgeBusy ? <LoaderCircle className="spin" size={14} /> : bridgeConnection.action === 'open' || bridgeConnection.action === 'deactivate' ? <Power size={14} /> : <Cable size={14} />}</button>
      <button type="button" disabled={bridgeBusy || bridgeAvailable === false || (bridgeAvailable === undefined && !bridgeClient.isAssociated())} onClick={() => refresh()} aria-label="Actualiser l’état du Bridge" title="Actualiser l’état du Bridge"><RefreshCcw size={13} /></button>
    </div>
  </section>;
}
