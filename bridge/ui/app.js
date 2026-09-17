const baseUrl = 'http://127.0.0.1:43821';
const title = document.querySelector('#status-title');
const message = document.querySelector('#status-message');
const dot = document.querySelector('#status-dot');
const output = document.querySelector('#main-output');
const cacheCount = document.querySelector('#cache-count');
const cacheFilesLabel = document.querySelector('#cache-files-label');
const cacheSize = document.querySelector('#cache-size');
const bridgeVersion = document.querySelector('#bridge-version');

requestAnimationFrame(() => document.body.classList.add('is-loaded'));

function setStatus(state) {
  dot.className = state;
  dot.parentElement.className = `status-beacon ${state}`;
}

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Requête impossible.');
  return response.status === 204 ? undefined : response.json();
}

async function refresh() {
  try {
    const status = await request('/v1/status');
    bridgeVersion.textContent = status.version;
    cacheCount.textContent = String(status.cachedTracks);
    cacheFilesLabel.textContent = status.cachedTracks > 1 ? 'fichiers audio enregistrés' : 'fichier audio enregistré';
    cacheSize.textContent = formatBytes(status.cachedBytes ?? 0);
    setStatus(status.paired ? 'ready' : '');
    title.textContent = status.paired ? 'Bridge associé' : 'Association requise';
    message.textContent = status.paired
      ? `Connecté à ${status.serverUrl}. SonoRiva peut piloter cette machine.`
      : 'Dans SonoRiva, ouvrez Paramètres puis cliquez sur « Connecter SonoRiva Bridge ».';
    if (!status.paired) return;
    const data = await request('/v1/outputs');
    output.innerHTML = '';
    for (const device of data.outputs) {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = device.name;
      option.selected = device.id === data.mainOutputId;
      output.append(option);
    }
    output.disabled = false;
  } catch (error) {
    setStatus('error');
    title.textContent = 'Bridge indisponible';
    message.textContent = error instanceof Error ? error.message : 'Le serveur local ne répond pas.';
  }
}

output.addEventListener('change', async () => {
  try {
    await request('/v1/outputs/main', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: output.value }),
    });
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : 'Sortie audio inaccessible.';
  }
});
document.querySelector('#refresh').addEventListener('click', refresh);
document.querySelector('#clear-cache').addEventListener('click', async () => {
  try {
    await request('/v1/cache', { method: 'DELETE' });
    await refresh();
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : 'Suppression du cache impossible.';
  }
});
refresh();
setInterval(refresh, 2000);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: value >= 10 ? 1 : 2 }).format(value)} ${units[unitIndex]}`;
}

const updateStatus = document.querySelector('#update-status');
const checkUpdate = document.querySelector('#check-update');
const installUpdate = document.querySelector('#install-update');
let updateRequestPending = false;

function renderUpdateStatus(status) {
  updateStatus.textContent = status.message;
  updateStatus.dataset.phase = status.phase;
  const busy = updateRequestPending || ['checking', 'downloading', 'installing'].includes(status.phase);
  checkUpdate.disabled = busy;
  installUpdate.disabled = busy;
  installUpdate.hidden = !['available', 'deferred'].includes(status.phase);
  installUpdate.textContent = status.version ? `Installer la version ${status.version} et redémarrer` : 'Installer et redémarrer';
}

async function refreshUpdateStatus() {
  try {
    renderUpdateStatus(await window.__TAURI__.core.invoke('bridge_update_status'));
  } catch {
    if (!updateRequestPending) renderUpdateStatus({ phase: 'error', message: 'État des mises à jour inaccessible. Cliquez sur Vérifier pour réessayer.' });
  }
}

async function runUpdate(install) {
  if (updateRequestPending) return;
  updateRequestPending = true;
  renderUpdateStatus({ phase: 'checking', message: 'Recherche d’une nouvelle version…' });
  try {
    const status = await window.__TAURI__.core.invoke('check_bridge_update', { install });
    updateRequestPending = false;
    renderUpdateStatus(status);
  } catch (error) {
    updateRequestPending = false;
    renderUpdateStatus({ phase: 'error', message: `Mise à jour impossible : ${error instanceof Error ? error.message : String(error)}` });
  }
}

checkUpdate.addEventListener('click', () => runUpdate(false));
installUpdate.addEventListener('click', () => runUpdate(true));
refreshUpdateStatus();
setInterval(refreshUpdateStatus, 1000);
