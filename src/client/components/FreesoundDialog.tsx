import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, Download, ExternalLink, LoaderCircle, Pause, Play, Search, ShieldCheck, Square, Volume2, Waves, X } from 'lucide-react';
import { api } from '../lib/api';
import { audioEngine } from '../lib/audio-engine';
import { bridgeClient, isBridgeUnavailableError } from '../lib/bridge-client';
import type { RoutedBridgeOutput } from '../lib/bridge-output-routing';
import { filterOpenverseResults, mergeOpenverseResults } from '../lib/openverse-results';
import type { Category, OpenverseLicenseFilter, OpenverseSearchResult, OpenverseSound, OpenverseSource, ProjectColor, TrackSubcategory } from '../types';

interface Props {
  initialQuery?: string;
  autoSearch?: boolean;
  projectId: string;
  categories: Category[];
  subcategories: TrackSubcategory[];
  projectColors: ProjectColor[];
  defaultCategoryId?: string;
  nextPosition: number;
  bridgeOutputs: RoutedBridgeOutput[];
  mainBridgeOutputId?: string;
  onImported: () => Promise<void>;
  onClose: () => void;
}

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused';

const sourceOptions: Array<{ value: OpenverseSource; label: string }> = [
  { value: 'freesound', label: 'Freesound' },
  { value: 'jamendo', label: 'Jamendo' },
  { value: 'wikimedia_audio', label: 'Wikimedia' },
];

export function OpenverseDialog({ initialQuery = '', autoSearch = false, projectId, categories, subcategories, projectColors, defaultCategoryId, nextPosition, bridgeOutputs, mainBridgeOutputId, onImported, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [minDuration, setMinDuration] = useState('');
  const [maxDuration, setMaxDuration] = useState('');
  const durationMinimum = minDuration === '' ? undefined : Number(minDuration);
  const durationMaximum = maxDuration === '' ? undefined : Number(maxDuration);
  const durationError = durationMinimum !== undefined && durationMaximum !== undefined && durationMinimum > durationMaximum
    ? 'Le temps minimum doit être inférieur ou égal au temps maximum.' : '';
  const hasDurationFilter = minDuration !== '' || maxDuration !== '';
  const [license, setLicense] = useState<OpenverseLicenseFilter>('all');
  const [sources, setSources] = useState<Set<OpenverseSource>>(() => new Set(sourceOptions.map((source) => source.value)));
  const [loadedSources, setLoadedSources] = useState<Set<OpenverseSource>>(new Set());
  const [loadingSources, setLoadingSources] = useState<Set<OpenverseSource>>(new Set());
  const [result, setResult] = useState<OpenverseSearchResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentSound, setCurrentSound] = useState<OpenverseSound>();
  const [currentOutputId, setCurrentOutputId] = useState<string>();
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [volume, setVolume] = useState(.9);
  const [soundToImport, setSoundToImport] = useState<OpenverseSound>();
  const [importTitle, setImportTitle] = useState('');
  const [importCategoryId, setImportCategoryId] = useState(defaultCategoryId ?? '');
  const [importSubcategoryId, setImportSubcategoryId] = useState('');
  const [importColor, setImportColor] = useState(() => categories.find((category) => category.id === defaultCategoryId)?.color ?? projectColors[0]?.color ?? '#DBEDF7');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const bridgePreviewIdRef = useRef<string | undefined>(undefined);
  const previewSequenceRef = useRef(0);
  const searchRef = useRef<AbortController | undefined>(undefined);
  const autoSearchStartedRef = useRef(false);
  const searchGenerationRef = useRef(0);
  const lastSearchRef = useRef<{ query: string; license: OpenverseLicenseFilter; page: number } | undefined>(undefined);
  const enrichingSourcesRef = useRef<Set<OpenverseSource>>(new Set());

  const stopPreview = useCallback(() => {
    previewSequenceRef.current += 1;
    if (bridgePreviewIdRef.current) {
      bridgeClient.stop(bridgePreviewIdRef.current, 0);
      bridgePreviewIdRef.current = undefined;
    }
    const audio = audioRef.current;
    audioRef.current = undefined;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setCurrentSound(undefined);
    setCurrentOutputId(undefined);
    setPlayerState('idle');
    setCurrentTime(0);
    setPlayerDuration(0);
  }, []);

  useEffect(() => bridgeClient.subscribe((playbacks) => {
    const playbackId = bridgePreviewIdRef.current;
    if (!playbackId) return;
    const playback = playbacks.find((candidate) => candidate.id === playbackId);
    if (!playback) {
      bridgePreviewIdRef.current = undefined;
      setPlayerState('paused');
      return;
    }
    setCurrentTime(playback.positionMs / 1_000);
    setPlayerDuration(playback.durationMs / 1_000);
    setPlayerState(playback.paused ? 'paused' : 'playing');
  }), []);

  useEffect(() => {
    const stop = () => stopPreview();
    window.addEventListener('sonoriva:stop-temporary-audio', stop);
    return () => {
      window.removeEventListener('sonoriva:stop-temporary-audio', stop);
      searchRef.current?.abort();
      stopPreview();
    };
  }, [stopPreview]);

  const searchSounds = useCallback(async (page = 1) => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setError('Saisissez au moins deux caractères.');
      return;
    }
    if (durationError) {
      setError(durationError);
      return;
    }
    if (!sources.size) {
      setError('Sélectionnez au moins une source.');
      return;
    }
    searchRef.current?.abort();
    const controller = new AbortController();
    const generation = searchGenerationRef.current + 1;
    searchGenerationRef.current = generation;
    searchRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await api.searchOpenverse({
        query: normalized,
        license,
        sources: [...sources],
        page,
      }, controller.signal);
      if (generation !== searchGenerationRef.current) return;
      setResult(response);
      setLoadedSources(new Set(sources));
      lastSearchRef.current = { query: normalized, license, page };
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : 'Recherche Openverse impossible.');
    } finally {
      if (searchRef.current === controller) setLoading(false);
    }
  }, [durationError, license, query, sources]);

  async function enrichResultsWithSource(source: OpenverseSource) {
    const lastSearch = lastSearchRef.current;
    if (!result || !lastSearch || loadedSources.has(source) || enrichingSourcesRef.current.has(source)) return;
    const generation = searchGenerationRef.current;
    enrichingSourcesRef.current.add(source);
    setLoadingSources((current) => new Set(current).add(source));
    setError('');
    try {
      const response = await api.searchOpenverse({
        query: lastSearch.query,
        license: lastSearch.license,
        sources: [source],
        page: lastSearch.page,
      });
      if (generation !== searchGenerationRef.current) return;
      setResult((current) => current ? mergeOpenverseResults(current, response) : response);
      setLoadedSources((current) => new Set(current).add(source));
    } catch (cause) {
      if (generation === searchGenerationRef.current) {
        const label = sourceOptions.find((option) => option.value === source)?.label ?? source;
        setError(cause instanceof Error ? cause.message : `Les résultats ${label} n’ont pas pu être ajoutés.`);
      }
    } finally {
      enrichingSourcesRef.current.delete(source);
      setLoadingSources((current) => {
        const next = new Set(current);
        next.delete(source);
        return next;
      });
    }
  }

  useEffect(() => {
    if (!autoSearch || autoSearchStartedRef.current || initialQuery.trim().length < 2) return;
    autoSearchStartedRef.current = true;
    searchSounds().catch(() => undefined);
  }, [autoSearch, initialQuery, searchSounds]);

  function togglePreview(sound: OpenverseSound, output?: RoutedBridgeOutput, browserOnly = false) {
    if (!browserOnly && bridgeClient.isEnabled()) {
      toggleBridgePreview(sound, output).catch((cause) => {
        if (isBridgeUnavailableError(cause)) {
          bridgeClient.fallbackToBrowser();
          togglePreview(sound, undefined, true);
          return;
        }
        if (sound.source !== 'freesound') {
          togglePreview(sound, undefined, true);
          return;
        }
        setPlayerState('paused');
        setError(cause instanceof Error ? cause.message : 'La préécoute Openverse ne peut pas démarrer dans le Bridge.');
      });
      return;
    }
    const existing = audioRef.current;
    if (currentSound?.id === sound.id && existing) {
      if (output?.id !== currentOutputId) {
        setPlayerState('loading');
        audioEngine.applyAudioOutput(existing, output?.name, output?.isDefault).then(() => {
          setCurrentOutputId(output?.id);
          return existing.play();
        }).catch(() => {
          setPlayerState('paused');
          setError(output ? `La sortie « ${output.name} » n’est pas accessible pour cette préécoute.` : "La préécoute n'a pas pu démarrer sur la sortie audio sélectionnée.");
        });
        return;
      }
      if (existing.paused) {
        setPlayerState('loading');
        audioEngine.applyAudioOutput(existing, output?.name, output?.isDefault).then(() => existing.play()).catch(() => {
          setPlayerState('paused');
          setError("La préécoute n'a pas pu démarrer sur la sortie audio sélectionnée.");
        });
      } else {
        existing.pause();
      }
      return;
    }

    stopPreview();
    const audio = new Audio(sound.previewUrl);
    audio.preload = 'auto';
    audio.volume = volume;
    audioRef.current = audio;
    setCurrentSound(sound);
    setCurrentOutputId(output?.id);
    setPlayerState('loading');
    setCurrentTime(0);
    setPlayerDuration(sound.durationSeconds);
    audio.addEventListener('playing', () => audioRef.current === audio && setPlayerState('playing'));
    audio.addEventListener('pause', () => audioRef.current === audio && !audio.ended && setPlayerState('paused'));
    audio.addEventListener('timeupdate', () => {
      if (audioRef.current !== audio) return;
      setCurrentTime(audio.currentTime);
      if (Number.isFinite(audio.duration)) setPlayerDuration(audio.duration);
    });
    audio.addEventListener('loadedmetadata', () => {
      if (audioRef.current === audio && Number.isFinite(audio.duration)) setPlayerDuration(audio.duration);
    });
    audio.addEventListener('ended', () => {
      if (audioRef.current !== audio) return;
      setCurrentTime(Number.isFinite(audio.duration) ? audio.duration : sound.durationSeconds);
      setPlayerState('paused');
    });
    audio.addEventListener('error', () => {
      if (audioRef.current !== audio) return;
      setPlayerState('paused');
      setError("La préécoute Openverse n'est pas disponible.");
    });
    audioEngine.applyAudioOutput(audio, output?.name, output?.isDefault).then(() => audio.play()).catch(() => {
      if (audioRef.current === audio) setPlayerState('paused');
      setError(output ? `La sortie « ${output.name} » n’est pas accessible pour cette préécoute.` : "La préécoute n'a pas pu démarrer sur la sortie audio sélectionnée.");
    });
  }

  async function toggleBridgePreview(sound: OpenverseSound, output?: RoutedBridgeOutput) {
    const existingId = bridgePreviewIdRef.current;
    if (currentSound?.id === sound.id && existingId) {
      if (output?.id !== currentOutputId && output) {
        setPlayerState('loading');
        await bridgeClient.setPlaybackOutput(existingId, output.id);
        setCurrentOutputId(output.id);
        return;
      }
      bridgeClient.togglePause(existingId);
      return;
    }
    if (currentSound?.id === sound.id && playerState === 'loading') return;
    stopPreview();
    const sequence = previewSequenceRef.current;
    setError('');
    setCurrentSound(sound);
    setCurrentOutputId(output?.id);
    setPlayerState('loading');
    setCurrentTime(0);
    setPlayerDuration(sound.durationSeconds);
    const status = await bridgeClient.discover();
    if (!status.capabilities?.includes('remotePreview')) {
      throw new Error('La préécoute Openverse nécessite SonoRiva Bridge 1.0.2 ou une version ultérieure.');
    }
    const playbackId = await bridgeClient.playRemotePreview({ id: sound.id, name: sound.name, url: sound.previewUrl, durationMs: Math.round(sound.durationSeconds * 1_000), volume }, output?.id);
    if (sequence !== previewSequenceRef.current) {
      bridgeClient.stop(playbackId, 0);
      return;
    }
    bridgePreviewIdRef.current = playbackId;
    setPlayerState('playing');
  }

  function closeDialog() {
    stopPreview();
    onClose();
  }

  function prepareImport(sound: OpenverseSound) {
    setSoundToImport(sound);
    setImportTitle(withoutAudioExtension(sound.name));
    setImportCategoryId(defaultCategoryId ?? '');
    setImportSubcategoryId('');
    setImportColor(categories.find((category) => category.id === defaultCategoryId)?.color ?? projectColors[0]?.color ?? '#DBEDF7');
    setImportError('');
  }

  async function importSound() {
    if (!soundToImport || importing) return;
    const title = importTitle.trim();
    if (!title) {
      setImportError('Donnez un nom au son.');
      return;
    }
    setImporting(true);
    setImportError('');
    try {
      await api.importRemoteTrack({
        projectId,
        categoryId: importCategoryId || undefined,
        subcategoryId: importSubcategoryId || undefined,
        title,
        durationMs: Math.max(1, Math.round(soundToImport.durationSeconds * 1_000)),
        position: nextPosition,
        url: soundToImport.previewUrl,
        sourceUrl: soundToImport.pageUrl,
        sourceId: `openverse:${soundToImport.source}:${soundToImport.id}`,
        tags: soundToImport.tags,
        description: soundToImport.tags.length ? `Tags Openverse : ${soundToImport.tags.join(', ')}` : `Importé depuis ${soundToImport.sourceLabel} via Openverse.`,
        copyrightText: `« ${soundToImport.name} » par ${soundToImport.username} — ${soundToImport.license.label} — ${soundToImport.pageUrl}`,
        color: importColor,
        loop: false,
      });
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : 'Import Openverse impossible.');
      setImporting(false);
      return;
    }
    setImportedIds((current) => new Set(current).add(soundToImport.id));
    setSoundToImport(undefined);
    setImporting(false);
    onImported().catch(() => setError("Le son est stocké, mais l'affichage du spectacle n'a pas pu être actualisé."));
  }

  function updateVolume(value: number) {
    setVolume(value);
    if (bridgePreviewIdRef.current) bridgeClient.setVolume(bridgePreviewIdRef.current, value);
    if (audioRef.current) audioRef.current.volume = value;
  }

  function seek(event: React.MouseEvent<HTMLButtonElement>) {
    if (!playerDuration) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    if (bridgePreviewIdRef.current) {
      bridgeClient.seek(bridgePreviewIdRef.current, progress);
      return;
    }
    const audio = audioRef.current;
    if (audio) audio.currentTime = progress * playerDuration;
  }

  const progress = playerDuration ? Math.min(1, currentTime / playerDuration) : 0;
  const mainBridgeOutput = bridgeOutputs.find((output) => output.id === mainBridgeOutputId);
  const alternateBridgeOutputs = mainBridgeOutput ? bridgeOutputs.filter((output) => output.id !== mainBridgeOutput.id) : [];
  const importSubcategories = subcategories.filter((subcategory) => subcategory.categoryId === (importCategoryId || null));

  function toggleSource(source: OpenverseSource) {
    const next = new Set(sources);
    if (next.has(source)) {
      if (next.size === 1) return;
      next.delete(source);
      if (currentSound?.source === source) stopPreview();
    } else {
      next.add(source);
      enrichResultsWithSource(source).catch(() => undefined);
    }
    setSources(next);
  }

  const visibleResults = result ? filterOpenverseResults(result.results, sources, durationMinimum, durationMaximum) : [];

  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
    <section className="dialog freesound-dialog openverse-dialog">
      <header>
        <div><p className="eyebrow">Bibliothèque externe</p><h2>Recherche Openverse</h2></div>
        <button className="icon-button" onClick={closeDialog} aria-label="Fermer Openverse"><X /></button>
      </header>

      <form className="freesound-search-form" onSubmit={(event) => { event.preventDefault(); searchSounds().catch(() => undefined); }}>
        <label className="freesound-query"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Applaudissements, porte, orage…" /></label>
        <button className="button primary" disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}Rechercher</button>
        <div className="openverse-source-filters" role="group" aria-label="Sources Openverse cumulables">
          {sourceOptions.map((source) => <button type="button" key={source.value} className={`openverse-source-filter source-${source.value}${sources.has(source.value) ? ' is-selected' : ''}`} aria-pressed={sources.has(source.value)} disabled={loading || loadingSources.has(source.value)} onClick={() => toggleSource(source.value)}>{loadingSources.has(source.value) && <LoaderCircle className="spin" size={12} />}{source.label}</button>)}
        </div>
        <select className="openverse-license-filter" aria-label="Licence" value={license} onChange={(event) => setLicense(event.target.value as OpenverseLicenseFilter)}>
          <option value="all">Toutes les licences CC</option>
          <option value="cc0">CC0 uniquement</option>
          <option value="by">CC BY uniquement</option>
        </select>
        <div className="openverse-duration-filters" role="group" aria-label="Filtrer par durée">
          <label>Temps min (s)<input type="number" min="0" step="any" value={minDuration} onChange={(event) => setMinDuration(event.target.value)} placeholder="Sans minimum" aria-invalid={Boolean(durationError)} aria-describedby={durationError ? 'openverse-duration-error' : undefined} /></label>
          <label>Temps max (s)<input type="number" min="0" step="any" value={maxDuration} onChange={(event) => setMaxDuration(event.target.value)} placeholder="Sans maximum" aria-invalid={Boolean(durationError)} aria-describedby={durationError ? 'openverse-duration-error' : undefined} /></label>
          <small>Le filtre de durée s’applique aux résultats de chaque page.</small>
          {durationError && <span id="openverse-duration-error" className="form-error" role="alert">{durationError}</span>}
        </div>
      </form>

      {error && <div className="form-error">{error}</div>}

      {!result && !loading ? <div className="freesound-empty"><Waves size={34} /><strong>Trouvez un son pour la scène</strong><span>Choisissez une ou plusieurs sources Openverse.</span></div> : result && <>
        <div className="freesound-results-heading"><strong>{hasDurationFilter ? `${visibleResults.length} résultat${visibleResults.length !== 1 ? 's' : ''} sur cette page` : visibleResults.length !== result.results.length ? `${visibleResults.length} résultat${visibleResults.length !== 1 ? 's' : ''} affiché${visibleResults.length !== 1 ? 's' : ''}` : `${result.count.toLocaleString('fr-FR')} résultat${result.count !== 1 ? 's' : ''}`}</strong><span>Page {result.page}</span></div>
        <div className="freesound-results">
          {visibleResults.map((sound) => {
            const active = currentSound?.id === sound.id;
            const preparingImport = soundToImport?.id === sound.id;
            return <article key={sound.id} className={`freesound-result openverse-result source-${sound.source}${active ? ' is-active' : ''}${preparingImport ? ' is-importing' : ''}`}>
              <div className="freesound-result-summary">
                <div className="freesound-preview-actions">
                  <button className="freesound-play" onClick={() => togglePreview(sound, mainBridgeOutput)} aria-label={`${active && playerState === 'playing' && currentOutputId === mainBridgeOutput?.id ? 'Mettre en pause' : 'Écouter'} ${sound.name}${mainBridgeOutput ? ` sur ${mainBridgeOutput.name}` : ''}`}>
                    {active && playerState === 'loading' && currentOutputId === mainBridgeOutput?.id ? <LoaderCircle className="spin" size={19} /> : active && playerState === 'playing' && currentOutputId === mainBridgeOutput?.id ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
                  </button>
                  {alternateBridgeOutputs.map((output) => <button type="button" className="freesound-output-play" key={output.id} style={{ '--output-color': output.color } as React.CSSProperties} onClick={() => togglePreview(sound, output)} aria-label={`Écouter ${sound.name} sur ${output.name}`} title={output.name}>
                    {active && playerState === 'loading' && currentOutputId === output.id ? <LoaderCircle className="spin" size={12} /> : active && playerState === 'playing' && currentOutputId === output.id ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                  </button>)}
                </div>
                <div className="freesound-result-main">
                  {preparingImport ? <label className="freesound-inline-title"><span>Nom du morceau</span><input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} maxLength={160} autoFocus /></label> : <a href={sound.pageUrl} target="_blank" rel="noreferrer" title={`Voir sur ${sound.sourceLabel}`}><strong>{sound.name}</strong><ExternalLink size={12} /></a>}
                  <span><em className={`openverse-source-badge source-${sound.source}`}>{sound.sourceLabel}</em> par {sound.username} · {formatDuration(sound.durationSeconds)}</span>
                  {!preparingImport && <div className="freesound-tags">{sound.tags.slice(0, 4).map((tag) => <em key={tag}>{tag}</em>)}</div>}
                </div>
                <div className="freesound-result-actions">
                  <a className={`freesound-license ${sound.license.code}`} href={sound.license.url} target="_blank" rel="noreferrer">{sound.license.label}</a>
                  <button className={preparingImport ? 'freesound-import-button is-cancel' : importedIds.has(sound.id) ? 'freesound-import-button is-imported' : 'freesound-import-button'} disabled={preparingImport && importing} onClick={() => preparingImport ? setSoundToImport(undefined) : prepareImport(sound)} aria-label={preparingImport ? `Annuler l'import de ${sound.name}` : `Importer ${sound.name}`} title={preparingImport ? "Annuler l'import" : importedIds.has(sound.id) ? 'Importer à nouveau' : 'Importer dans SonoRiva'}>
                    {preparingImport ? <X size={17} /> : importedIds.has(sound.id) ? <CircleCheck size={17} /> : <Download size={17} />}
                  </button>
                </div>
              </div>
              {preparingImport && <div className="freesound-import-morph">
                <div className="freesound-import-morph-inner">
                  <label>Catégorie de destination<select value={importCategoryId} onChange={(event) => { setImportCategoryId(event.target.value); setImportSubcategoryId(''); }}><option value="">Sans catégorie</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                  {importSubcategories.length > 0 && <label>Sous-catégorie<select value={importSubcategoryId} onChange={(event) => setImportSubcategoryId(event.target.value)}><option value="">À la racine de la catégorie</option>{importSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</select></label>}
                  <label className="freesound-import-color">Couleur du morceau<span><input type="color" value={importColor} onChange={(event) => setImportColor(event.target.value)} aria-label="Couleur personnalisée du morceau" />{projectColors.map((projectColor) => <button key={projectColor.id} type="button" className={projectColor.color.toLowerCase() === importColor.toLowerCase() ? 'is-selected' : ''} style={{ '--swatch-color': projectColor.color } as React.CSSProperties} onClick={() => setImportColor(projectColor.color)} aria-label={`Choisir la couleur ${projectColor.color}`} title={projectColor.color} />)}</span></label>
                  <div className="freesound-import-source"><ShieldCheck size={16} /><span><strong>{sound.license.label}</strong> · {sound.username}<small>La source et la licence seront enregistrées avec le morceau.</small></span></div>
                  {importError && <div className="form-error">{importError}</div>}
                  <footer><button className="button ghost" onClick={() => setSoundToImport(undefined)} disabled={importing}>Annuler</button><button className="button primary" onClick={() => importSound().catch(() => undefined)} disabled={importing || !importTitle.trim()}>{importing ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}{importing ? 'Téléchargement…' : 'Importer et stocker'}</button></footer>
                </div>
              </div>}
            </article>;
          })}
          {visibleResults.length === 0 && <div className="freesound-empty compact"><strong>Aucun son pour ces sources</strong><span>Activez une autre source ou lancez une nouvelle recherche.</span></div>}
        </div>
        <div className="freesound-pagination">
          <button className="button ghost" disabled={loading || result.page <= 1} onClick={() => searchSounds(result.page - 1).catch(() => undefined)}>Précédent</button>
          <button className="button ghost" disabled={loading || !result.hasNext} onClick={() => searchSounds(result.page + 1).catch(() => undefined)}>Suivant</button>
        </div>
      </>}

      {currentSound && <section className="freesound-player" aria-label="Lecteur Openverse">
        <button className="freesound-player-toggle" onClick={() => togglePreview(currentSound, bridgeOutputs.find((output) => output.id === currentOutputId))} aria-label={playerState === 'playing' ? 'Pause' : 'Lecture'}>
          {playerState === 'loading' ? <LoaderCircle className="spin" size={18} /> : playerState === 'playing' ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <div className="freesound-player-main"><strong>{currentSound.name}</strong><span>{formatDuration(currentTime)} / {formatDuration(playerDuration)}</span><button className="freesound-player-progress" onClick={seek} aria-label="Avancer dans la préécoute"><i style={{ transform: `scaleX(${progress})` }} /></button></div>
        <label className="freesound-volume"><Volume2 size={16} /><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => updateVolume(Number(event.target.value))} aria-label="Volume Openverse" /></label>
        <button className="freesound-player-stop" onClick={stopPreview} aria-label="Arrêter la préécoute"><Square size={15} fill="currentColor" /></button>
      </section>}
    </section>
  </div>;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const rounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function withoutAudioExtension(filename: string): string {
  return filename.replace(/\.(?:mp3|wav|wave|aif|aiff|flac|ogg|m4a|aac)$/i, '');
}
