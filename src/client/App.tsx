import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowUpDown, AudioLines, AudioWaveform, CircleCheck, Clock3, Columns3, Download, FolderInput, FolderPlus, GripVertical, History, LayoutDashboard, LifeBuoy, ListMusic, ListPlus, LoaderCircle, Menu, Move, Pause, Pencil, Play, Plus, Radio,
  LockKeyhole, LogIn, RefreshCcw, Repeat2, RotateCcw, Scan, Search, Settings, Settings2, SlidersHorizontal, Square, SquareDashed, Timer, Trash2, Upload, Volume2, VolumeX, Waves, Wifi, WifiOff, X,
} from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import { AuthScreen } from './components/AuthScreen';
import { AudioOutputConsole } from './components/AudioOutputConsole';
import { AudioOutputUpgradeConsole, type AudioOutputUpgradeMode } from './components/AudioOutputUpgradeConsole';
import { AppUpdateBanner } from './components/AppUpdateBanner';
import { BatchTrackDialog } from './components/BatchTrackDialog';
import { BatchTrackMoveDialog } from './components/BatchTrackMoveDialog';
import { OpenverseDialog } from './components/FreesoundDialog';
import { FolderImportDialog } from './components/FolderImportDialog';
import { PlaylistPad } from './components/PlaylistPad';
import { PlaylistPanel, type PlaylistOptions } from './components/PlaylistPanel';
import { PlaybackOutputSelector } from './components/PlaybackOutputSelector';
import { SoundShowImportDialog } from './components/SoundShowImportDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { SupportDialog } from './components/SupportDialog';
import { TrackDialog } from './components/TrackDialog';
import { TrackPad } from './components/TrackPad';
import { TrackSubcategoryDialog } from './components/TrackSubcategoryDialog';
import { TrackSubcategoryPad } from './components/TrackSubcategoryPad';
import { UploadDialog } from './components/UploadDialog';
import { WhatsNewDialog } from './components/WhatsNewDialog';
import { WorkspaceLayoutBlock, workspaceBlockMime } from './components/WorkspaceLayoutBlock';
import { WorkspaceLayoutToolbar } from './components/WorkspaceLayoutToolbar';
import { api, ApiError } from './lib/api';
import { applyAppUpdate, subscribeToAppUpdate } from './lib/app-update';
import { applyAppSkin, readAppSkin, saveAppSkin, type AppSkin } from './lib/app-skin';
import { appNoticesEnabled, shouldApplyAppUpdate, shouldOpenReleaseNotes } from './lib/app-mode';
import { readAudioFileDurationMs } from './lib/audio-file-metadata';
import { audioEngine, playbackPositionAt, playbackVolumeAt, type ActivePlayback } from './lib/audio-engine';
import { bridgeClient } from './lib/bridge-client';
import type { RoutedBridgeOutput } from './lib/bridge-output-routing';
import { contrastColor } from './lib/color-contrast';
import { droppedFilesHaveSubfolders, droppedFolderNames, droppedFolderTags, firstFolderName, readDroppedAudioFiles, titleFromAudioFilename, type DroppedAudioFile, type FolderImportMode } from './lib/file-import';
import { formatShortcut, projectShortcut, projectShortcutDefinitions, resolvePrimaryShortcut, shortcutFromKeyboardEvent, shortcutMainKey, shortcutMatchesKeyboardEvent, shortcutModifierKeys, trackIndexFromKeyboardEvent, trackShortcutLabel } from './lib/keyboard-shortcuts';
import { mobileTrackAutoScrollDelta, type ClientPoint } from './lib/mobile-track-reorder';
import { cachedTrackIds, cacheTrackOffline, deleteCachedTracks, deleteOfflineAudio } from './lib/offline-audio';
import { movePlaylistItem as repositionPlaylistItem, playlistEntries, playlistQueueItems, playlistRows as groupPlaylistItems, type PlaylistItemPlacement, type PlaylistQueueItem } from './lib/playlist-rows';
import { categoryIsFavorites, parseStopwatchState, playlistIsVisible, resolveCategoryId } from './lib/session-state';
import { applySoundboardViewMode, defaultSoundboardViewSettings, readSoundboardViewSettings, resolveSoundboardView, soundboardViewModeForCategory, soundboardViewStorageKey, type SoundboardViewMode, type SoundboardViewSettings } from './lib/soundboard-view';
import { intersectsSelection, type SelectionRectangle } from './lib/track-selection';
import { normalizeTrackTags, toggleSearchScopeSelection, trackMatchesEnabledSearch, type TrackSearchScope } from './lib/track-tags';
import { canDropTrackInSubcategoryDrawer, subcategoryDrawerEdgeClasses, subcategoryMatchesSearch, trackDropPlacement, trackIdAfterTarget } from './lib/track-subcategories';
import { createWorkspaceLayout, dockWorkspaceItem, moveWorkspaceItem, placeWorkspaceItemOnGrid, readSavedWorkspaceLayouts, readWorkspaceLayout, resizeWorkspaceItem, setWorkspaceItemCollapsed, swapWorkspaceItems, workspaceBlockLabels, workspaceDockableBlockIds, workspaceDockItems, workspaceItemIsCollapsed, workspaceItemIsDocked, workspaceLayoutItem, workspaceLayoutsMatch, workspaceLayoutSnapshot, workspaceLayoutStorageKey, workspaceSavedLayoutsStorageKey, type SavedWorkspaceLayout, type WorkspaceBlockId } from './lib/workspace-layout';
import type { AccountSummary, Category, KeyAction, MouseAction, Playlist, Project, ProjectColor, ProjectDetail, ProjectKeyboardShortcutKey, ReleaseInfo, RemoteCommand, Track, TrackSubcategory, User } from './types';

const colors = ['#DBEDF7', '#8b5cf6', '#06b6d4', '#ec4899', '#22c55e', '#eab308'];
const mouseActions: Array<{ value: MouseAction; label: string }> = [
  { value: 'start', label: 'Démarrer' },
  { value: 'crossfade', label: 'Fondu enchaîné' },
  { value: 'fade-in', label: "Fondu d'entrée" },
  { value: 'replace', label: 'Remplacer' },
  { value: 'stop', label: 'Arrêter' },
  { value: 'none', label: 'Aucune action' },
];
type SearchScope = TrackSearchScope | 'subcategories';
type MobileTrackDropTarget =
  | { kind: 'track'; id: string; placement: 'before' | 'group' | 'after' }
  | { kind: 'subcategory'; id: string }
  | { kind: 'category'; id: string };

interface MobileTrackDrag {
  trackId: string;
  selection: boolean;
  target?: MobileTrackDropTarget;
}

interface MobileTrackDragPreview {
  trackId: string;
  title: string;
  color: string;
  count: number;
  clientX: number;
  clientY: number;
}
const clockFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} Ko`;
  const megabytes = bytes / 1024 ** 2;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(megabytes)} Mo`;
}

function setSelectionDragImage(event: React.DragEvent<HTMLElement>, tracks: Track[]) {
  const preview = document.createElement('div');
  preview.className = 'selection-drag-preview';
  preview.setAttribute('aria-hidden', 'true');
  tracks.slice(0, 3).forEach((track, index) => {
    const card = document.createElement('span');
    card.className = 'selection-drag-preview-card';
    card.style.setProperty('--selection-preview-index', String(index));
    card.textContent = track.title;
    preview.append(card);
  });
  const count = document.createElement('strong');
  count.textContent = String(tracks.length);
  preview.append(count);
  document.body.append(preview);
  event.dataTransfer.setDragImage(preview, 36, 32);
  window.setTimeout(() => preview.remove());
}

let authenticationBootstrap: Promise<{ user: User }> | undefined;

function bootstrapAuthentication() {
  authenticationBootstrap ??= api.me().catch((cause) => {
    if (cause instanceof ApiError && cause.status === 401 && window.location.pathname === '/demo') return api.startDemo();
    throw cause;
  });
  return authenticationBootstrap;
}

export default function App() {
  const [user, setUser] = useState<User | null>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [detail, setDetail] = useState<ProjectDetail>();
  const [selectedProjectId, setSelectedProjectId] = useState(localStorage.getItem('sonoriva-project'));
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [searchScopes, setSearchScopes] = useState<Set<SearchScope>>(() => new Set(['name']));
  const [activePlaybacks, setActivePlaybacks] = useState<ActivePlayback[]>([]);
  const [playbackHistory, setPlaybackHistory] = useState<Map<string, number>>(new Map());
  const [offlineTrackIds, setOfflineTrackIds] = useState<Set<string>>(new Set());
  const [preloadProgress, setPreloadProgress] = useState<{ done: number; total: number }>();
  const [fileDropActive, setFileDropActive] = useState(false);
  const [dropUploadProgress, setDropUploadProgress] = useState<{ done: number; total: number; filename: string }>();
  const [folderImportFiles, setFolderImportFiles] = useState<DroppedAudioFile[]>();
  const [categoryWidth, setCategoryWidth] = useState(() => readNumber('sonoriva-category-width', 112));
  const [reorderMode, setReorderMode] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [selectionRectangle, setSelectionRectangle] = useState<SelectionRectangle>();
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);
  const [draggedTrackId, setDraggedTrackId] = useState<string>();
  const [mobileTrackDragPreview, setMobileTrackDragPreview] = useState<MobileTrackDragPreview>();
  const [dropTrackId, setDropTrackId] = useState<string>();
  const [dropTrackPlacement, setDropTrackPlacement] = useState<'before' | 'group' | 'after'>();
  const [dropSubcategoryId, setDropSubcategoryId] = useState<string>();
  const [draggedTrackSubcategoryId, setDraggedTrackSubcategoryId] = useState<string>();
  const [dropSubcategoryPositionId, setDropSubcategoryPositionId] = useState<string>();
  const [dropCategoryId, setDropCategoryId] = useState<string>();
  const [draggedPlaylistId, setDraggedPlaylistId] = useState<string>();
  const [dropPlaylistId, setDropPlaylistId] = useState<string>();
  const [dropPlaylistTrackId, setDropPlaylistTrackId] = useState<string>();
  const [dropPlaylistAfter, setDropPlaylistAfter] = useState(false);
  const [categoryManageMode, setCategoryManageMode] = useState(false);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string>();
  const [dropCategoryOrderId, setDropCategoryOrderId] = useState<string>();
  const [dropCategoryAfter, setDropCategoryAfter] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openSubcategoryId, setOpenSubcategoryId] = useState<string>();
  const [editingSubcategoryName, setEditingSubcategoryName] = useState(false);
  const [subcategoryNameDraft, setSubcategoryNameDraft] = useState('');
  const [openSubcategoriesOnDrag, setOpenSubcategoriesOnDrag] = useState(() => localStorage.getItem('sonoriva-open-subcategories-on-drag') !== 'false');
  const [subcategoryDialog, setSubcategoryDialog] = useState<'new' | TrackSubcategory>();
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia('(max-width: 560px)').matches);
  const [stackedWorkspaceLayout, setStackedWorkspaceLayout] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [desktopColumns, setDesktopColumns] = useState(() => readNumberRange('sonoriva-track-columns', 6, 2, 12));
  const [mobileColumns, setMobileColumns] = useState(() => readNumberRange('sonoriva-track-columns-mobile', 2, 1, 3));
  const [soundboardViewSettings, setSoundboardViewSettings] = useState<SoundboardViewSettings>(() => ({ ...defaultSoundboardViewSettings }));
  const [soundboardViewScope, setSoundboardViewScope] = useState<'category' | 'all'>('category');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [soundShowImportOpen, setSoundShowImportOpen] = useState(false);
  const [openverseOpen, setOpenverseOpen] = useState(false);
  const [openverseAutoSearch, setOpenverseAutoSearch] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const [settingsInitialSection, setSettingsInitialSection] = useState<'billing'>();
  const [accountSummary, setAccountSummary] = useState<AccountSummary>();
  const [bridgeAvailable, setBridgeAvailable] = useState<boolean>();
  const [routedBridgeOutputs, setRoutedBridgeOutputs] = useState<RoutedBridgeOutput[]>([]);
  const [mainBridgeOutputId, setMainBridgeOutputId] = useState<string>();
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo>();
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [automaticUpdates, setAutomaticUpdates] = useState(() => localStorage.getItem('sonoriva-automatic-updates') === 'true');
  const [appSkin, setAppSkin] = useState<AppSkin>(() => readAppSkin());
  const [editingTrack, setEditingTrack] = useState<Track>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [workspaceLayout, setWorkspaceLayout] = useState(() => createWorkspaceLayout());
  const [savedWorkspaceLayouts, setSavedWorkspaceLayouts] = useState<SavedWorkspaceLayout[]>([]);
  const [playlistItems, setPlaylistItems] = useState<PlaylistQueueItem[]>([]);
  const [playlistOptions, setPlaylistOptions] = useState<PlaylistOptions>({ name: 'Nouvelle playlist', color: '#8b5cf6', autostart: false, loop: false, random: false, showNextButton: false, gapMs: 0, crossfadeMs: 0 });
  const [playlistOptionsOpen, setPlaylistOptionsOpen] = useState(false);
  const [loadedPlaylistId, setLoadedPlaylistId] = useState<string>();
  const [playlistCurrentIndex, setPlaylistCurrentIndex] = useState(0);
  const [playlistPlaybackIds, setPlaylistPlaybackIds] = useState<string[]>([]);
  const [playlistSaving, setPlaylistSaving] = useState(false);
  const [socket, setSocket] = useState<Socket>();
  const [connected, setConnected] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState('');
  const [error, setError] = useState('');
  const [shortcutNotice, setShortcutNotice] = useState('');
  const [nextTrackVolume, setNextTrackVolume] = useState(() => readNumberRange('sonoriva-next-volume', 100, 0, 100));
  const [masterVolume, setMasterVolume] = useState(() => readNumberRange('sonoriva-master-volume', 100, 0, 100));
  const [shortcutOutputSecondary, setShortcutOutputSecondary] = useState(false);
  const [keepNextTrackVolume, setKeepNextTrackVolume] = useState(() => localStorage.getItem('sonoriva-keep-next-volume') === 'true');
  const [now, setNow] = useState(() => Date.now());
  const [chronoElapsedMs, setChronoElapsedMs] = useState(0);
  const [chronoStartedAt, setChronoStartedAt] = useState<number | undefined>(undefined);
  const categoryResize = useRef<{ x: number; width: number; latest: number } | undefined>(undefined);
  const fileDragDepth = useRef(0);
  const fileUploadBusy = useRef(false);
  const marqueeStart = useRef<{ x: number; y: number; additive: boolean; selectedIds: Set<string> } | undefined>(undefined);
  const marqueeMoved = useRef(false);
  const suppressSelectionClick = useRef(false);
  const mobileTrackDragRef = useRef<MobileTrackDrag | undefined>(undefined);
  const subcategoryOpenTimerRef = useRef<{ id: string; timer: number } | undefined>(undefined);
  const playlistRunRef = useRef(false);
  const playlistTransitioningRef = useRef(false);
  const playlistAdvanceTimerRef = useRef<number | undefined>(undefined);
  const playlistRunGenerationRef = useRef(0);
  const playlistPlayedRowIdsRef = useRef(new Set<string>());
  const releaseAutoShownRef = useRef(false);
  const workspaceLayoutUserRef = useRef<string | null>(null);
  const workspaceLayoutHydratedRef = useRef(false);
  const secondaryOutputHeldRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const remoteRequested = new URLSearchParams(window.location.search).get('remote') === '1';
  const customLayoutsEnabled = accountSummary?.features.customLayouts ?? true;
  const playlistsEnabled = accountSummary?.features.playlists ?? true;
  const remoteControlEnabled = accountSummary?.features.remoteControl ?? true;
  const remote = remoteRequested && remoteControlEnabled;
  const workspaceUserId = user?.id;
  const unseenReleases = useMemo(() => releaseInfo?.releases.filter((release) => releaseInfo.unseenVersions.includes(release.version)) ?? [], [releaseInfo]);
  const releasesForDialog = unseenReleases.length > 0 ? unseenReleases : releaseInfo?.releases ?? [];
  const noticesEnabled = appNoticesEnabled(user);
  const handleAccountChange = useCallback((account: AccountSummary) => {
    setAccountSummary(account);
    setBridgeAvailable(account.bridgeAvailable);
  }, []);
  const changeAppSkin = useCallback((skin: AppSkin) => {
    setAppSkin(skin);
    saveAppSkin(skin);
    applyAppSkin(skin);
  }, []);

  useEffect(() => audioEngine.subscribe(setActivePlaybacks), []);
  useEffect(() => {
    if (!user || supportOpen) return;
    let cancelled = false;
    const refresh = () => api.supportTickets().then(({ tickets }) => {
      if (!cancelled) setSupportUnreadCount(tickets.reduce((total, ticket) => total + ticket.unreadCount, 0));
    }).catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [supportOpen, user]);
  useEffect(() => audioEngine.setMasterVolume(masterVolume / 100), [masterVolume]);
  useEffect(() => audioEngine.setMaxActivePlaybacks(detail?.project.maxActivePlaybacks ?? 8), [detail?.project.maxActivePlaybacks]);
  useEffect(() => audioEngine.subscribeHistory(setPlaybackHistory), []);
  useEffect(() => subscribeToAppUpdate(setUpdateAvailable), []);
  useEffect(() => {
    if (!customLayoutsEnabled) setLayoutEditing(false);
  }, [customLayoutsEnabled]);
  useEffect(() => {
    if (!shouldApplyAppUpdate({
      automaticUpdates: automaticUpdates || Boolean(user?.isDemo),
      updateAvailable,
      activePlaybackCount: activePlaybacks.length,
    })) return;
    applyAppUpdate();
  }, [activePlaybacks.length, automaticUpdates, updateAvailable, user?.isDemo]);
  useEffect(() => {
    const persistProgress = () => audioEngine.persistActiveProgress();
    window.addEventListener('pagehide', persistProgress);
    return () => window.removeEventListener('pagehide', persistProgress);
  }, []);

  useEffect(() => {
    if (!noticesEnabled) {
      setReleaseInfo(undefined);
      releaseAutoShownRef.current = false;
      return;
    }
    api.releases().then(setReleaseInfo).catch(() => setReleaseInfo(undefined));
  }, [noticesEnabled]);

  useEffect(() => {
    if (!shouldOpenReleaseNotes({
      noticesEnabled,
      automaticUpdates,
      unseenReleaseCount: unseenReleases.length,
      activePlaybackCount: activePlaybacks.length,
      alreadyOpened: releaseAutoShownRef.current,
    })) return;
    releaseAutoShownRef.current = true;
    setWhatsNewOpen(true);
  }, [activePlaybacks.length, automaticUpdates, noticesEnabled, unseenReleases.length]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => () => {
    if (playlistAdvanceTimerRef.current !== undefined) window.clearTimeout(playlistAdvanceTimerRef.current);
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 560px)');
    const onChange = () => setCompactLayout(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const onChange = () => setStackedWorkspaceLayout(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    bootstrapAuthentication().then(({ user: current }) => {
      localStorage.setItem('sonoriva-user', JSON.stringify(current));
      setUser(current);
    }).catch((cause) => {
      if (cause instanceof ApiError && cause.status === 401) {
        localStorage.removeItem('sonoriva-user');
        setUser(null);
      } else {
        const cached = readCache<User>('sonoriva-user');
        if (cached?.isDemo) localStorage.removeItem('sonoriva-user');
        if (cached && !cached.isDemo) setUser(cached);
        else { setError('Le serveur est indisponible.'); setUser(null); }
      }
    });
  }, []);

  const loadProjects = useCallback(async () => {
    let result: { projects: Project[] };
    try {
      result = await api.projects();
      localStorage.setItem('sonoriva-projects', JSON.stringify(result));
    } catch (cause) {
      const cached = readCache<{ projects: Project[] }>('sonoriva-projects');
      if (!cached) throw cause;
      result = cached;
    }
    setProjects(result.projects);
    setSelectedProjectId((current) => {
      const next = result.projects.some((project) => project.id === current) ? current : result.projects[0]?.id ?? null;
      if (next) localStorage.setItem('sonoriva-project', next); else localStorage.removeItem('sonoriva-project');
      return next;
    });
  }, []);

  useEffect(() => { if (user) loadProjects().catch((cause) => setError(cause.message)); }, [user, loadProjects]);
  useEffect(() => {
    if (!workspaceUserId) { setSavedWorkspaceLayouts([]); return; }
    workspaceLayoutHydratedRef.current = false;
    workspaceLayoutUserRef.current = workspaceUserId;
    setWorkspaceLayout(readWorkspaceLayout(localStorage.getItem(workspaceLayoutStorageKey(workspaceUserId))));
    setSavedWorkspaceLayouts(readSavedWorkspaceLayouts(localStorage.getItem(workspaceSavedLayoutsStorageKey(workspaceUserId))));
  }, [workspaceUserId]);
  useEffect(() => {
    if (!workspaceUserId || workspaceLayoutUserRef.current !== workspaceUserId) return;
    if (!workspaceLayoutHydratedRef.current) {
      workspaceLayoutHydratedRef.current = true;
      return;
    }
    localStorage.setItem(workspaceLayoutStorageKey(workspaceUserId), JSON.stringify(workspaceLayout));
  }, [workspaceUserId, workspaceLayout]);
  useEffect(() => {
    if (!user) return;
    api.account().then(({ account }) => {
      setAccountSummary(account);
      setBridgeAvailable(account.bridgeAvailable);
      if (account.bridgeAvailable) return;
      if (bridgeClient.isAssociated()) bridgeClient.stopAll(0);
      bridgeClient.forgetAssociation();
    }).catch(() => undefined);
  }, [user]);

  const updateRoutedBridgeOutputs = useCallback((outputs: RoutedBridgeOutput[], mainOutputId: string | undefined) => {
    setRoutedBridgeOutputs(outputs);
    setMainBridgeOutputId(mainOutputId);
  }, []);

  const refreshProject = useCallback(async () => {
    if (!selectedProjectId) return;
    let result: ProjectDetail;
    try {
      result = await api.project(selectedProjectId);
      localStorage.setItem(`sonoriva-detail:${selectedProjectId}`, JSON.stringify(result));
    } catch (cause) {
      const cached = readCache<ProjectDetail>(`sonoriva-detail:${selectedProjectId}`);
      if (!cached) throw cause;
      result = cached;
    }
    setDetail({ ...result, colors: result.colors ?? [], playlists: result.playlists ?? [], subcategories: result.subcategories ?? [] });
  }, [selectedProjectId]);

  const uploadDroppedFiles = useCallback(async (files: DroppedAudioFile[], mode?: FolderImportMode) => {
    if (!detail || fileUploadBusy.current || files.length === 0) return;
    fileUploadBusy.current = true;
    const destinationCategoryId = selectedCategoryId !== 'all' && detail.categories.some((category) => category.id === selectedCategoryId)
      ? selectedCategoryId : undefined;
    const failures: string[] = [];
    const uploadedTracks: Array<{ track: Track; file: DroppedAudioFile }> = [];
    const folderCategoryIds = new Map<string, string>();
    let changed = false;
    let uploaded = 0;
    setError('');
    setDropUploadProgress({ done: 0, total: files.length, filename: files[0]!.relativePath });
    try {
      if (mode === 'categories') {
        const folderNames = droppedFolderNames(files);
        for (const [index, folderName] of folderNames.entries()) {
          const key = folderName.toLocaleLowerCase('fr');
          const existing = detail.categories.find((category) => category.name.trim().toLocaleLowerCase('fr') === key);
          if (existing) {
            folderCategoryIds.set(key, existing.id);
            continue;
          }
          const color = detail.colors[index % detail.colors.length]?.color ?? colors[index % colors.length]!;
          const result = await api.createCategory(detail.project.id, folderName, color, detail.categories.length + index);
          folderCategoryIds.set(key, result.category.id);
          changed = true;
        }
      }

      for (const [index, droppedFile] of files.entries()) {
        const { file } = droppedFile;
        setDropUploadProgress({ done: index, total: files.length, filename: droppedFile.relativePath });
        const form = new FormData();
        const folderName = firstFolderName(droppedFile);
        const categoryId = mode === 'categories' && folderName
          ? folderCategoryIds.get(folderName.toLocaleLowerCase('fr'))
          : destinationCategoryId;
        form.set('projectId', detail.project.id);
        if (categoryId) form.set('categoryId', categoryId);
        form.set('title', titleFromAudioFilename(file.name));
        form.set('position', String(detail.tracks.length + index));
        form.set('file', file);
        if (mode === 'tags') form.set('tags', normalizeTrackTags(droppedFolderTags(droppedFile)).join(','));
        try {
          const durationMs = await readAudioFileDurationMs(file);
          if (durationMs) form.set('durationMs', String(durationMs));
          const result = await api.uploadTrack(form);
          uploadedTracks.push({ track: result.track, file: droppedFile });
          uploaded += 1;
          changed = true;
        } catch {
          failures.push(droppedFile.relativePath);
        }
        setDropUploadProgress({ done: index + 1, total: files.length, filename: droppedFile.relativePath });
      }

      if (mode === 'subcategories') {
        const groupedTracks = new Map<string, { name: string; trackIds: string[] }>();
        for (const item of uploadedTracks) {
          const name = firstFolderName(item.file);
          if (!name) continue;
          const key = name.toLocaleLowerCase('fr');
          const group = groupedTracks.get(key) ?? { name, trackIds: [] };
          group.trackIds.push(item.track.id);
          groupedTracks.set(key, group);
        }
        for (const [groupIndex, [key, group]] of [...groupedTracks].entries()) {
          try {
            const existing = detail.subcategories.find((subcategory) => subcategory.categoryId === (destinationCategoryId ?? null) && subcategory.name.trim().toLocaleLowerCase('fr') === key);
            if (existing) {
              await Promise.all(group.trackIds.map((trackId) => api.moveTrackToSubcategory(detail.project.id, trackId, existing.id)));
            } else {
              const color = detail.colors[groupIndex % detail.colors.length]?.color
                ?? detail.categories.find((category) => category.id === destinationCategoryId)?.color
                ?? colors[groupIndex % colors.length]!;
              const initialTrackIds = group.trackIds.slice(0, 100);
              const result = await api.createTrackSubcategory(detail.project.id, { name: group.name, categoryId: destinationCategoryId ?? null, color, trackIds: initialTrackIds });
              await Promise.all(group.trackIds.slice(100).map((trackId) => api.moveTrackToSubcategory(detail.project.id, trackId, result.subcategory.id)));
            }
          } catch {
            failures.push(`organisation de ${group.name}`);
          }
        }
      }

      if (changed) await refreshProject();
      if (failures.length > 0) setError(`${uploaded} fichier${uploaded > 1 ? 's' : ''} importé${uploaded > 1 ? 's' : ''}. Échec : ${failures.join(', ')}`);
    } finally {
      setDropUploadProgress(undefined);
      fileUploadBusy.current = false;
    }
  }, [detail, refreshProject, selectedCategoryId]);

  useEffect(() => { refreshProject().catch((cause) => setError(cause.message)); }, [refreshProject]);

  useEffect(() => {
    if (!detail || remote) return;
    const containsFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const onDragEnter = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      fileDragDepth.current += 1;
      setFileDropActive(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
      if (fileDragDepth.current === 0) setFileDropActive(false);
    };
    const onDrop = async (event: DragEvent) => {
      if (!containsFiles(event)) return;
      event.preventDefault();
      fileDragDepth.current = 0;
      setFileDropActive(false);
      let files: DroppedAudioFile[];
      try {
        files = event.dataTransfer ? await readDroppedAudioFiles(event.dataTransfer) : [];
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Lecture du dossier impossible.');
        return;
      }
      if (files.length === 0) {
        setError('Déposez des fichiers MP3, WAV, OGG, FLAC, M4A ou AAC.');
        return;
      }
      if (droppedFilesHaveSubfolders(files)) {
        setFolderImportFiles(files);
        return;
      }
      uploadDroppedFiles(files).catch((cause) => {
        fileUploadBusy.current = false;
        setDropUploadProgress(undefined);
        setError(cause instanceof Error ? cause.message : 'Import des fichiers impossible.');
      });
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      fileDragDepth.current = 0;
    };
  }, [detail, remote, uploadDroppedFiles]);

  useEffect(() => {
    if (!selectedProjectId) {
      setChronoElapsedMs(0);
      setChronoStartedAt(undefined);
      return;
    }
    const restored = parseStopwatchState(localStorage.getItem(stopwatchStorageKey(selectedProjectId)));
    setChronoElapsedMs(restored.elapsedMs);
    setChronoStartedAt(restored.startedAt);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!detail) return;
    const storageKey = categoryStorageKey(detail.project.id);
    const categoryId = resolveCategoryId(detail.categories.filter((category) => !categoryIsFavorites(category.name)).map((category) => category.id), localStorage.getItem(storageKey));
    setSelectedCategoryId(categoryId);
    localStorage.setItem(storageKey, categoryId);
  }, [detail]);

  useEffect(() => {
    let cancelled = false;
    if (!detail) {
      setOfflineTrackIds(new Set());
      return;
    }
    cachedTrackIds(detail.tracks.map((track) => track.id)).then((trackIds) => {
      if (cancelled) return;
      setOfflineTrackIds(trackIds);
      if (detail.tracks.length > 0 && trackIds.size === detail.tracks.length) setOfflineStatus('Projet disponible hors ligne');
      else if (trackIds.size > 0) setOfflineStatus(`${trackIds.size}/${detail.tracks.length} sons hors ligne`);
      else setOfflineStatus('');
    }).catch(() => {
      if (!cancelled) setOfflineTrackIds(new Set());
    });
    return () => { cancelled = true; };
  }, [detail]);

  useEffect(() => {
    if (!selectedProjectId || !user) return;
    const connection = io({ withCredentials: true });
    setSocket(connection);
    connection.on('connect', () => {
      setConnected(true);
      connection.emit('join-project', { projectId: selectedProjectId, role: remote ? 'controller' : 'player' });
    });
    connection.on('disconnect', () => setConnected(false));
    if (!remote) connection.on('remote-command', (command: RemoteCommand) => {
      const currentTracks = detail?.tracks ?? [];
      if (command.type === 'stop-all' || command.type === 'stop-all-immediate') {
        window.dispatchEvent(new Event('sonoriva:stop-temporary-audio'));
        return audioEngine.stopAll(currentTracks, command.type === 'stop-all-immediate' ? 0 : undefined);
      }
      if (command.type === 'stop-last') return audioEngine.stopLast(currentTracks, command.immediate);
      const track = currentTracks.find((candidate) => candidate.id === command.trackId);
      if (!track) return;
      if (command.type === 'run-action') audioEngine.runAction(command.action, track, currentTracks, command.volumeMultiplier, command.outputId).catch((cause) => setError(cause.message));
      else if (command.type === 'play') audioEngine.play(track, track.fadeInMs, command.volumeMultiplier, command.outputId).catch((cause) => setError(cause.message));
      else audioEngine.stop(track.id, track.fadeOutMs);
    });
    return () => { connection.disconnect(); setSocket(undefined); setConnected(false); };
  }, [selectedProjectId, user, remote, detail?.tracks]);

  const normalizedSearch = search.trim().toLocaleLowerCase('fr');
  const isSearching = normalizedSearch.length > 0;
  const columnCategoryId = isSearching ? 'all' : selectedCategoryId;
  const categoryTracks = useMemo(() => (detail?.tracks ?? []).filter((track) => {
    const inCategory = isSearching || selectedCategoryId === 'all' || track.categoryId === selectedCategoryId;
    const matches = !isSearching || trackMatchesEnabledSearch(track, normalizedSearch, {
      name: searchScopes.has('name'),
      tags: searchScopes.has('tags'),
    });
    return inCategory && matches;
  }), [detail?.tracks, isSearching, normalizedSearch, searchScopes, selectedCategoryId]);
  const visibleSubcategories = useMemo(() => (detail?.subcategories ?? []).filter((subcategory) => {
    if (isSearching) return searchScopes.has('subcategories') && subcategoryMatchesSearch(subcategory.name, normalizedSearch);
    return selectedCategoryId === 'all' || subcategory.categoryId === selectedCategoryId;
  }), [detail?.subcategories, isSearching, normalizedSearch, searchScopes, selectedCategoryId]);
  const topLevelTracks = useMemo(() => isSearching ? categoryTracks : categoryTracks.filter((track) => !track.subcategoryId), [categoryTracks, isSearching]);
  const visiblePlaylists = useMemo(() => remote || !playlistsEnabled ? [] : (detail?.playlists ?? []).filter((playlist) =>
    playlistIsVisible(playlist.categoryId, selectedCategoryId, isSearching)
    && (!isSearching || (searchScopes.has('name') && playlist.name.toLocaleLowerCase('fr').includes(normalizedSearch)))), [detail?.playlists, isSearching, normalizedSearch, playlistsEnabled, remote, searchScopes, selectedCategoryId]);
  const visibleBoardItems = useMemo(() => [
    ...topLevelTracks.map((track) => ({ kind: 'track' as const, id: track.id, position: track.position, track })),
    ...visibleSubcategories.map((subcategory) => ({ kind: 'subcategory' as const, id: subcategory.id, position: subcategory.position, subcategory })),
    ...visiblePlaylists.map((playlist) => ({ kind: 'playlist' as const, id: playlist.id, position: playlist.position, playlist })),
  ].sort((first, second) => first.position - second.position || first.id.localeCompare(second.id)), [topLevelTracks, visiblePlaylists, visibleSubcategories]);
  const openSubcategory = useMemo(() => detail?.subcategories.find((subcategory) => subcategory.id === openSubcategoryId), [detail?.subcategories, openSubcategoryId]);
  const openSubcategoryTracks = useMemo(() => {
    const subcategoryMatches = Boolean(isSearching && searchScopes.has('subcategories') && openSubcategory && subcategoryMatchesSearch(openSubcategory.name, normalizedSearch));
    const candidates = subcategoryMatches ? detail?.tracks ?? [] : categoryTracks;
    return candidates.filter((track) => track.subcategoryId === openSubcategoryId).sort((first, second) => first.position - second.position);
  }, [categoryTracks, detail?.tracks, isSearching, normalizedSearch, openSubcategory, openSubcategoryId, searchScopes]);
  const visibleTracks = useMemo(() => visibleBoardItems.flatMap((item) => {
    if (item.kind === 'track') return [item.track];
    if (item.kind === 'subcategory' && item.id === openSubcategoryId) return openSubcategoryTracks;
    return [];
  }), [openSubcategoryId, openSubcategoryTracks, visibleBoardItems]);
  const selectedTracks = useMemo(() => (detail?.tracks ?? []).filter((track) => selectedTrackIds.has(track.id)), [detail?.tracks, selectedTrackIds]);
  const draggingSelectedTracks = selectionMode && Boolean(draggedTrackId && selectedTrackIds.has(draggedTrackId));
  const activeTrackIds = useMemo(() => new Set(activePlaybacks.map((playback) => playback.trackId)), [activePlaybacks]);
  const playbacksByTrack = useMemo(() => {
    const grouped = new Map<string, ActivePlayback[]>();
    for (const playback of activePlaybacks) grouped.set(playback.trackId, [...(grouped.get(playback.trackId) ?? []), playback]);
    return grouped;
  }, [activePlaybacks]);
  const playingTracks = useMemo(() => {
    return activePlaybacks.flatMap((playback) => {
      const track = detail?.tracks.find((candidate) => candidate.id === playback.trackId);
      if (!track) return [];
      return [{ playback, track }];
    });
  }, [activePlaybacks, detail?.tracks]);

  useEffect(() => () => {
    if (subcategoryOpenTimerRef.current) window.clearTimeout(subcategoryOpenTimerRef.current.timer);
  }, []);
  const maxActivePlaybacks = detail?.project.maxActivePlaybacks ?? 8;
  const compactPlaybackThreshold = detail?.project.compactPlaybackThreshold ?? 5;
  const compactPlayerCards = playingTracks.length >= compactPlaybackThreshold;
  const tracksToPreload = useMemo(() => {
    if (!detail) return [];
    if (selectedCategoryId === 'all') return detail.tracks;
    return detail.tracks.filter((track) => track.categoryId === selectedCategoryId);
  }, [detail, selectedCategoryId]);
  const preloadedInCategory = tracksToPreload.filter((track) => offlineTrackIds.has(track.id)).length;
  const soundboardCategoryScopeAvailable = !isSearching && selectedCategoryId !== 'all';
  const effectiveSoundboardViewScope = soundboardCategoryScopeAvailable ? soundboardViewScope : 'all';
  const soundboardViewMode = soundboardViewModeForCategory(soundboardViewSettings, effectiveSoundboardViewScope === 'category' ? selectedCategoryId : undefined);
  const soundboardView = resolveSoundboardView(soundboardViewMode, categoryTracks.length, soundboardViewSettings.automaticListThreshold);
  const trackColumns = soundboardView === 'list'
    ? compactLayout ? soundboardViewSettings.mobileListColumns : soundboardViewSettings.desktopListColumns
    : compactLayout ? mobileColumns : desktopColumns;
  const currentCategory = detail?.categories.find((category) => category.id === selectedCategoryId);
  const displayedCategories = useMemo(() => detail?.categories.filter((category) => !categoryIsFavorites(category.name)) ?? [], [detail?.categories]);
  const resolvedMainBridgeOutputId = routedBridgeOutputs.some((output) => output.id === mainBridgeOutputId) ? mainBridgeOutputId : routedBridgeOutputs[0]?.id;
  const secondaryBridgeOutputId = routedBridgeOutputs.find((output) => output.id !== resolvedMainBridgeOutputId)?.id;
  const displayedChronoMs = chronoElapsedMs + (chronoStartedAt === undefined ? 0 : Math.max(0, now - chronoStartedAt));
  const playlistQueueRows = useMemo(() => groupPlaylistItems(playlistItems), [playlistItems]);
  const playlistPlaybacks = activePlaybacks.filter((playback) => playlistPlaybackIds.includes(playback.id));
  const playlistPlayback = playlistPlaybacks.reduce<ActivePlayback | undefined>((longest, playback) => {
    const remaining = playback.durationMs - playback.elapsedMs - (playback.paused ? 0 : Math.max(0, performance.now() - playback.resumedAtMs));
    if (!longest) return playback;
    const longestRemaining = longest.durationMs - longest.elapsedMs - (longest.paused ? 0 : Math.max(0, performance.now() - longest.resumedAtMs));
    return remaining > longestRemaining ? playback : longest;
  }, undefined);
  const detailProjectId = detail?.project.id;

  useEffect(() => {
    const visibleIds = new Set(visibleTracks.map((track) => track.id));
    setSelectedTrackIds((current) => {
      const next = new Set([...current].filter((trackId) => visibleIds.has(trackId)));
      return next.size === current.size ? current : next;
    });
  }, [visibleTracks]);

  useEffect(() => {
    if (openSubcategoryId && !visibleSubcategories.some((subcategory) => subcategory.id === openSubcategoryId)) setOpenSubcategoryId(undefined);
  }, [openSubcategoryId, visibleSubcategories]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedTrackIds(new Set());
    setSelectionRectangle(undefined);
    setBatchEditOpen(false);
    setShortcutOutputSecondary(false);
    secondaryOutputHeldRef.current = false;
  }, [selectedProjectId]);

  useEffect(() => {
    if (!secondaryBridgeOutputId) setShortcutOutputSecondary(false);
  }, [secondaryBridgeOutputId]);

  useEffect(() => {
    if (!detailProjectId) return;
    setDesktopColumns(readNumberRange(trackColumnsStorageKey(detailProjectId, columnCategoryId, false), 6, 2, 12));
    setMobileColumns(readNumberRange(trackColumnsStorageKey(detailProjectId, columnCategoryId, true), 2, 1, 3));
  }, [columnCategoryId, detailProjectId]);

  useEffect(() => {
    if (!detailProjectId) return;
    setSoundboardViewSettings(readSoundboardViewSettings(localStorage.getItem(soundboardViewStorageKey(detailProjectId))));
  }, [detailProjectId]);

  const consumeNextTrackVolume = useCallback(() => {
    const multiplier = nextTrackVolume / 100;
    if (!keepNextTrackVolume) {
      setNextTrackVolume(100);
      localStorage.removeItem('sonoriva-next-volume');
    }
    return multiplier;
  }, [keepNextTrackVolume, nextTrackVolume]);

  const shortcutLaunchOutputId = useCallback(() => {
    if (secondaryOutputHeldRef.current || shortcutOutputSecondary) return secondaryBridgeOutputId;
    return resolvedMainBridgeOutputId;
  }, [resolvedMainBridgeOutputId, secondaryBridgeOutputId, shortcutOutputSecondary]);

  const sendOrRun = useCallback((command: RemoteCommand, track?: Track) => {
    const preparedCommand = command.type === 'play' && command.volumeMultiplier === undefined
      ? { ...command, volumeMultiplier: consumeNextTrackVolume() }
      : command;
    if (remote && detail) {
      socket?.emit('remote-command', { projectId: detail.project.id, command: preparedCommand });
      return;
    }
    if (preparedCommand.type === 'stop-all' || preparedCommand.type === 'stop-all-immediate') {
      playlistRunRef.current = false;
      playlistTransitioningRef.current = false;
      playlistRunGenerationRef.current += 1;
      clearPlaylistAdvanceTimer();
      setPlaylistPlaybackIds([]);
      window.dispatchEvent(new Event('sonoriva:stop-temporary-audio'));
      audioEngine.stopAll(detail?.tracks ?? [], preparedCommand.type === 'stop-all-immediate' ? 0 : undefined);
    }
    else if (preparedCommand.type === 'stop-last') audioEngine.stopLast(detail?.tracks ?? [], preparedCommand.immediate);
    else if (preparedCommand.type === 'stop' && track) audioEngine.stop(track.id, track.fadeOutMs);
    else if (preparedCommand.type === 'play' && track) audioEngine.play(track, track.fadeInMs, preparedCommand.volumeMultiplier, preparedCommand.outputId ?? shortcutLaunchOutputId()).catch((cause) => setError(cause.message));
  }, [consumeNextTrackVolume, detail, remote, shortcutLaunchOutputId, socket]);

  const runTrackAction = useCallback((action: MouseAction, track: Track) => {
    if (action === 'none') return;
    const startsPlayback = action === 'start' || action === 'crossfade' || action === 'fade-in' || action === 'replace';
    const volumeMultiplier = startsPlayback ? consumeNextTrackVolume() : undefined;
    if (remote && detail) {
      socket?.emit('remote-command', { projectId: detail.project.id, command: { type: 'run-action', trackId: track.id, action, volumeMultiplier } satisfies RemoteCommand });
      return;
    }
    audioEngine.runAction(action, track, detail?.tracks ?? [], volumeMultiplier, shortcutLaunchOutputId()).catch((cause) => setError(cause.message));
  }, [consumeNextTrackVolume, detail, remote, shortcutLaunchOutputId, socket]);

  const playTrackOnOutput = useCallback((track: Track, outputId: string) => {
    if (remote || !routedBridgeOutputs.some((output) => output.id === outputId)) return;
    const volumeMultiplier = consumeNextTrackVolume();
    audioEngine.play(track, track.fadeInMs, volumeMultiplier, outputId).catch((cause) => setError(cause.message));
  }, [consumeNextTrackVolume, remote, routedBridgeOutputs]);

  const startPlaylistRow = useCallback(async (row: (typeof playlistQueueRows)[number], index: number, fadeInMs?: number): Promise<string[]> => {
    const tracks = row.items.flatMap((item) => {
      const track = detail?.tracks.find((candidate) => candidate.id === item.trackId);
      return track ? [track] : [];
    });
    if (tracks.length === 0) return [];
    const generation = ++playlistRunGenerationRef.current;
    playlistRunRef.current = true;
    playlistPlayedRowIdsRef.current.add(row.id);
    setPlaylistCurrentIndex(index);
    try {
      await Promise.all(tracks.map((track) => audioEngine.preload(track)));
      if (generation !== playlistRunGenerationRef.current) return [];
      const results = await Promise.allSettled(tracks.map((track) => audioEngine.play({ ...track, loop: false }, fadeInMs ?? track.fadeInMs)));
      const playbackIds = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      const firstFailure = results.find((result) => result.status === 'rejected');
      const failureMessage = firstFailure?.status === 'rejected' && firstFailure.reason instanceof Error ? firstFailure.reason.message : undefined;
      if (generation !== playlistRunGenerationRef.current) {
        for (const playbackId of playbackIds) audioEngine.stopInstance(playbackId, 0);
        return [];
      }
      if (playbackIds.length === 0) throw new Error(failureMessage ?? 'Aucun morceau de la rangée n’a pu démarrer.');
      if (playbackIds.length < tracks.length) setError(failureMessage ?? 'Certains morceaux de la rangée n’ont pas pu démarrer.');
      setPlaylistPlaybackIds(playbackIds);
      return playbackIds;
    } catch (cause) {
      if (generation === playlistRunGenerationRef.current) {
        playlistRunRef.current = false;
        setPlaylistPlaybackIds([]);
        setError(cause instanceof Error ? cause.message : 'Lecture de la playlist impossible.');
      }
      return [];
    }
  }, [detail?.tracks]);

  const playPlaylistAt = useCallback(async (index: number, fadeInMs?: number): Promise<string[]> => {
    const row = playlistQueueRows[index];
    if (!row) return [];
    return startPlaylistRow(row, index, fadeInMs);
  }, [playlistQueueRows, startPlaylistRow]);

  const nextPlaylistIndex = useCallback((currentIndex: number): number | undefined => {
    if (playlistQueueRows.length === 0) return undefined;
    if (playlistOptions.random) {
      let candidates = playlistQueueRows.map((row, index) => ({ row, index })).filter(({ row }) => !playlistPlayedRowIdsRef.current.has(row.id));
      if (candidates.length === 0) {
        if (!playlistOptions.loop) return undefined;
        playlistPlayedRowIdsRef.current.clear();
        candidates = playlistQueueRows.map((row, index) => ({ row, index })).filter(({ index }) => playlistQueueRows.length === 1 || index !== currentIndex);
      }
      return candidates[Math.floor(Math.random() * candidates.length)]?.index;
    }
    if (currentIndex + 1 < playlistQueueRows.length) return currentIndex + 1;
    return playlistOptions.loop ? 0 : undefined;
  }, [playlistOptions.loop, playlistOptions.random, playlistQueueRows]);

  useEffect(() => {
    if (playlistPlaybackIds.length === 0 || playlistPlaybackIds.some((playbackId) => activePlaybacks.some((playback) => playback.id === playbackId))) return;
    if (playlistTransitioningRef.current) return;
    setPlaylistPlaybackIds([]);
    if (!playlistRunRef.current) return;
    const nextIndex = nextPlaylistIndex(playlistCurrentIndex);
    if (nextIndex === undefined) {
      playlistRunRef.current = false;
      return;
    }
    if (playlistOptions.gapMs > 0) {
      playlistAdvanceTimerRef.current = window.setTimeout(() => {
        playlistAdvanceTimerRef.current = undefined;
        if (playlistRunRef.current) playPlaylistAt(nextIndex).catch(() => undefined);
      }, playlistOptions.gapMs);
      return;
    }
    playPlaylistAt(nextIndex).catch(() => undefined);
  }, [activePlaybacks, nextPlaylistIndex, playPlaylistAt, playlistCurrentIndex, playlistOptions.gapMs, playlistPlaybackIds]);

  useEffect(() => {
    if (!playlistPlayback || playlistPlayback.paused || playlistPlayback.fadingOut || playlistOptions.crossfadeMs <= 0 || playlistTransitioningRef.current) return;
    const nextIndex = nextPlaylistIndex(playlistCurrentIndex);
    if (nextIndex === undefined) return;
    const nextRow = playlistQueueRows[nextIndex];
    if (!nextRow) return;
    for (const item of nextRow.items) {
      const nextTrack = detail?.tracks.find((track) => track.id === item.trackId);
      if (nextTrack) audioEngine.preload(nextTrack).catch(() => undefined);
    }
    const elapsedMs = playlistPlayback.elapsedMs + Math.max(0, performance.now() - playlistPlayback.resumedAtMs);
    const remainingMs = Math.max(0, playlistPlayback.durationMs - elapsedMs);
    const crossfadeMs = Math.min(playlistOptions.crossfadeMs, playlistPlayback.durationMs, remainingMs);
    const timer = window.setTimeout(() => {
      if (!playlistRunRef.current || playlistTransitioningRef.current) return;
      playlistTransitioningRef.current = true;
      const outgoingPlaybackIds = [...playlistPlaybackIds];
      playPlaylistAt(nextIndex, crossfadeMs).then((nextPlaybackIds) => {
        if (nextPlaybackIds.length > 0) for (const playbackId of outgoingPlaybackIds) audioEngine.stopInstance(playbackId, crossfadeMs);
        else {
          for (const playbackId of outgoingPlaybackIds) audioEngine.stopInstance(playbackId, 0);
          setPlaylistPlaybackIds([]);
        }
      }).finally(() => { playlistTransitioningRef.current = false; });
    }, Math.max(0, remainingMs - crossfadeMs));
    return () => window.clearTimeout(timer);
  }, [detail?.tracks, nextPlaylistIndex, playPlaylistAt, playlistCurrentIndex, playlistOptions.crossfadeMs, playlistPlayback, playlistPlaybackIds, playlistQueueRows]);

  function clearPlaylistAdvanceTimer() {
    if (playlistAdvanceTimerRef.current === undefined) return;
    window.clearTimeout(playlistAdvanceTimerRef.current);
    playlistAdvanceTimerRef.current = undefined;
  }

  function stopPlaylistPlayback() {
    playlistRunRef.current = false;
    playlistTransitioningRef.current = false;
    playlistRunGenerationRef.current += 1;
    clearPlaylistAdvanceTimer();
    for (const playbackId of playlistPlaybackIds) audioEngine.stopInstance(playbackId, 0);
    setPlaylistPlaybackIds([]);
  }

  function playPausePlaylist() {
    if (playlistPlaybacks.length > 0) {
      for (const playback of playlistPlaybacks) audioEngine.togglePauseInstance(playback.id);
      return;
    }
    clearPlaylistAdvanceTimer();
    playlistPlayedRowIdsRef.current.clear();
    playPlaylistAt(Math.min(playlistCurrentIndex, Math.max(0, playlistQueueRows.length - 1))).catch(() => undefined);
  }

  function playPlaylistRow(index: number) {
    stopPlaylistPlayback();
    playlistPlayedRowIdsRef.current.clear();
    playPlaylistAt(index).catch(() => undefined);
  }

  function skipPlaylistRow() {
    const nextIndex = nextPlaylistIndex(playlistCurrentIndex);
    if (nextIndex === undefined) return stopPlaylistPlayback();
    stopPlaylistPlayback();
    playPlaylistAt(nextIndex).catch(() => undefined);
  }

  function addTrackToPlaylist(trackId: string, targetRowId?: string, placement: PlaylistItemPlacement = 'after') {
    if (!playlistsEnabled) return;
    if (!detail?.tracks.some((track) => track.id === trackId)) return;
    revealPlaylistModule();
    setPlaylistItems((current) => {
      const rows = groupPlaylistItems(current).map((row) => ({ ...row, items: [...row.items] }));
      const currentRowId = rows[playlistCurrentIndex]?.id;
      const itemId = crypto.randomUUID();
      if (!targetRowId) return [...current, { id: itemId, trackId, rowId: crypto.randomUUID() }];
      const targetIndex = rows.findIndex((row) => row.id === targetRowId);
      if (targetIndex < 0) return current;
      if (placement === 'group') {
        if (rows[targetIndex]!.items.length >= (detail.project.maxPlaylistGroupSize ?? 4)) {
          setError(`Cette rangée est limitée à ${detail.project.maxPlaylistGroupSize ?? 4} morceaux.`);
          return current;
        }
        rows[targetIndex]!.items.push({ id: itemId, trackId, rowId: targetRowId });
      } else {
        const rowId = crypto.randomUUID();
        rows.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, { id: rowId, items: [{ id: itemId, trackId, rowId }] });
      }
      if (currentRowId) setPlaylistCurrentIndex(Math.max(0, rows.findIndex((row) => row.id === currentRowId)));
      return rows.flatMap((row) => row.items);
    });
  }

  function addCategoryToPlaylist() {
    if (!playlistsEnabled) return;
    if (tracksToPreload.length === 0) return;
    setPlaylistItems((current) => [...current, ...tracksToPreload.map((track) => ({ id: crypto.randomUUID(), trackId: track.id, rowId: crypto.randomUUID() }))]);
    revealPlaylistModule();
  }

  function revealPlaylistModule() {
    setWorkspaceLayout((current) => setWorkspaceItemCollapsed(current, 'playlist', false));
  }

  function movePlaylistItem(itemId: string, targetRowId: string, placement: PlaylistItemPlacement) {
    setPlaylistItems((current) => {
      const currentRow = groupPlaylistItems(current)[playlistCurrentIndex];
      const currentAnchorItemId = currentRow?.items.find((item) => item.id !== itemId)?.id ?? currentRow?.items[0]?.id;
      const result = repositionPlaylistItem(current, itemId, targetRowId, placement, detail?.project.maxPlaylistGroupSize ?? 4);
      if (result.limitReached) setError(`Cette rangée est limitée à ${detail?.project.maxPlaylistGroupSize ?? 4} morceaux.`);
      if (currentAnchorItemId && result.changed) setPlaylistCurrentIndex(Math.max(0, groupPlaylistItems(result.items).findIndex((row) => row.items.some((item) => item.id === currentAnchorItemId))));
      return result.items;
    });
  }

  function removePlaylistItem(itemId: string) {
    const removedItem = playlistItems.find((item) => item.id === itemId);
    if (!removedItem) return;
    const removedRowIndex = playlistQueueRows.findIndex((row) => row.id === removedItem.rowId);
    if (removedRowIndex === playlistCurrentIndex) stopPlaylistPlayback();
    setPlaylistItems((current) => current.filter((item) => item.id !== itemId));
    setPlaylistCurrentIndex((current) => Math.max(0, removedRowIndex < current && playlistQueueRows[removedRowIndex]?.items.length === 1 ? current - 1 : current));
    playlistPlayedRowIdsRef.current.delete(removedItem.rowId);
  }

  function resetPlaylistEditor() {
    playlistRunRef.current = false;
    playlistTransitioningRef.current = false;
    playlistRunGenerationRef.current += 1;
    clearPlaylistAdvanceTimer();
    setPlaylistPlaybackIds([]);
    setPlaylistItems([]);
    setLoadedPlaylistId(undefined);
    setPlaylistCurrentIndex(0);
    setPlaylistOptions({ name: 'Nouvelle playlist', color: detail?.colors[0]?.color ?? '#8b5cf6', autostart: false, loop: false, random: false, showNextButton: false, gapMs: 0, crossfadeMs: 0 });
    setPlaylistOptionsOpen(false);
    playlistPlayedRowIdsRef.current.clear();
  }

  function clearPlaylist() {
    stopPlaylistPlayback();
    resetPlaylistEditor();
  }

  function loadPlaylist(playlist: Playlist) {
    if (!playlistsEnabled) return;
    stopPlaylistPlayback();
    const entries = (playlist.items?.length ? playlist.items : playlist.trackIds.map((trackId, rowIndex) => ({ trackId, rowIndex })))
      .filter((item) => detail?.tracks.some((track) => track.id === item.trackId));
    const items = playlistQueueItems(entries, () => crypto.randomUUID());
    setPlaylistItems(items);
    setPlaylistOptions({ name: playlist.name, color: playlist.color, autostart: playlist.autostart, loop: playlist.loop, random: playlist.random, showNextButton: playlist.showNextButton ?? false, gapMs: playlist.gapMs ?? 0, crossfadeMs: playlist.crossfadeMs ?? 0 });
    setLoadedPlaylistId(playlist.id);
    setPlaylistCurrentIndex(0);
    setPlaylistOptionsOpen(false);
    revealPlaylistModule();
    playlistPlayedRowIdsRef.current.clear();
    const firstRow = groupPlaylistItems(items)[0];
    if (playlist.autostart && firstRow) {
      startPlaylistRow(firstRow, 0).catch(() => undefined);
    }
  }

  async function saveCurrentPlaylist() {
    if (!playlistsEnabled || !detail || playlistItems.length === 0) return;
    setPlaylistSaving(true);
    try {
      const { playlist } = await api.savePlaylist(detail.project.id, loadedPlaylistId, {
        ...playlistOptions,
        name: playlistOptions.name.trim() || 'Playlist sans titre',
        categoryId: currentCategory?.id ?? detail.categories[0]?.id ?? null,
        items: playlistEntries(playlistItems),
      });
      setLoadedPlaylistId(playlist.id);
      setPlaylistOptions((current) => ({ ...current, name: playlist.name }));
      setDetail((current) => current ? { ...current, playlists: current.playlists.some((item) => item.id === playlist.id) ? current.playlists.map((item) => item.id === playlist.id ? playlist : item) : [...current.playlists, playlist] } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sauvegarde de la playlist impossible.');
    } finally {
      setPlaylistSaving(false);
    }
  }

  async function deleteCurrentPlaylist() {
    if (!detail || !loadedPlaylistId || !window.confirm(`Supprimer la playlist « ${playlistOptions.name} » ?`)) return;
    try {
      await api.deletePlaylist(detail.project.id, loadedPlaylistId);
      setDetail((current) => current ? { ...current, playlists: current.playlists.filter((playlist) => playlist.id !== loadedPlaylistId) } : current);
      setLoadedPlaylistId(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Suppression de la playlist impossible.');
    }
  }

  const selectCategory = useCallback((categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setSearch('');
    if (detail) localStorage.setItem(categoryStorageKey(detail.project.id), categoryId);
  }, [detail]);

  const preloadCategory = useCallback(async () => {
    const remaining = tracksToPreload.filter((track) => !offlineTrackIds.has(track.id));
    if (!remaining.length) return;
    setPreloadProgress({ done: tracksToPreload.length - remaining.length, total: tracksToPreload.length });
    let done = tracksToPreload.length - remaining.length;
    try {
      for (let index = 0; index < remaining.length; index += 3) {
        const batch = remaining.slice(index, index + 3);
        await Promise.all(batch.map(async (track) => {
          await cacheTrackOffline(track.id);
          setOfflineTrackIds((current) => new Set(current).add(track.id));
          await audioEngine.preload(track);
        }));
        done += batch.length;
        setPreloadProgress({ done, total: tracksToPreload.length });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mise à disposition hors ligne interrompue.');
    } finally {
      setPreloadProgress(undefined);
    }
  }, [offlineTrackIds, tracksToPreload]);

  useEffect(() => {
    if (!detail) return;
    const holdShortcut = projectShortcut(detail.project, 'secondaryOutputHoldShortcut');
    const adjustMasterVolume = (delta: number) => {
      setMasterVolume((current) => {
        const next = Math.min(100, Math.max(0, current + delta));
        localStorage.setItem('sonoriva-master-volume', String(next));
        setShortcutNotice(`Volume maître : ${next} %`);
        return next;
      });
    };
    const moveCategory = (direction: 1 | -1) => {
      const ids = ['all', ...displayedCategories.map((category) => category.id)];
      const currentIndex = Math.max(0, ids.indexOf(selectedCategoryId));
      selectCategory(ids[(currentIndex + direction + ids.length) % ids.length]!);
    };
    const onKey = (event: KeyboardEvent) => {
      if (shortcutMatchesKeyboardEvent(event, projectShortcut(detail.project, 'searchShortcut'))) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if ((event.target instanceof HTMLInputElement && event.target.type !== 'range') || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      if (selectionMode) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setSelectionMode(false);
          setSelectedTrackIds(new Set());
          setSelectionRectangle(undefined);
        }
        return;
      }
      const shortcut = shortcutFromKeyboardEvent(event);
      if (shortcutMatchesKeyboardEvent(event, holdShortcut)) {
        event.preventDefault();
        secondaryOutputHeldRef.current = true;
        return;
      }
      const keyAction = event.key === 'Escape'
        ? detail.project.escapeKeyAction ?? 'stop-all'
        : event.key === 'Backspace' && event.shiftKey
          ? detail.project.shiftBackspaceKeyAction ?? 'stop-last'
          : event.key === 'Backspace'
            ? detail.project.backspaceKeyAction ?? 'stop-last-immediate'
            : event.key === ' '
              ? detail.project.spaceKeyAction ?? 'stop-all-immediate'
              : undefined;
      if (keyAction && keyAction !== 'none') {
        event.preventDefault();
        if (keyAction === 'stop-all') {
          sendOrRun({ type: 'stop-all' });
        } else if (keyAction === 'stop-all-immediate') {
          sendOrRun({ type: 'stop-all-immediate' });
        } else if (keyAction === 'stop-last') {
          sendOrRun({ type: 'stop-last', immediate: false });
        } else if (keyAction === 'stop-last-immediate') {
          sendOrRun({ type: 'stop-last', immediate: true });
        }
        return;
      }
      if (!shortcut) return;
      const run = (callback: () => void, repeat = false) => {
        event.preventDefault();
        if (!event.repeat || repeat) callback();
      };
      if (shortcutMatchesKeyboardEvent(event, projectShortcut(detail.project, 'nextCategoryShortcut'))) return run(() => moveCategory(1));
      if (shortcutMatchesKeyboardEvent(event, projectShortcut(detail.project, 'previousCategoryShortcut'))) return run(() => moveCategory(-1));
      if (shortcutMatchesKeyboardEvent(event, projectShortcut(detail.project, 'loadCategoryShortcut'))) return run(() => { preloadCategory().catch(() => undefined); });
      if (shortcutMatchesKeyboardEvent(event, projectShortcut(detail.project, 'toggleOutputShortcut'))) return run(() => {
        if (!secondaryBridgeOutputId) {
          setShortcutNotice('La sortie secondaire nécessite SonoRiva Bridge et deux sorties audio routées.');
          return;
        }
        setShortcutOutputSecondary((current) => {
          setShortcutNotice(`Prochains départs : sortie ${current ? 'principale' : 'secondaire'}`);
          return !current;
        });
      });
      if (shortcutMatchesKeyboardEvent(event, projectShortcut(detail.project, 'masterVolumeUpFastShortcut'))) return run(() => adjustMasterVolume(10), true);
      if (shortcutMatchesKeyboardEvent(event, projectShortcut(detail.project, 'masterVolumeDownFastShortcut'))) return run(() => adjustMasterVolume(-10), true);
      if (shortcutMatchesKeyboardEvent(event, projectShortcut(detail.project, 'masterVolumeUpShortcut'))) return run(() => adjustMasterVolume(2), true);
      if (shortcutMatchesKeyboardEvent(event, projectShortcut(detail.project, 'masterVolumeDownShortcut'))) return run(() => adjustMasterVolume(-2), true);

      const ignoredModifiers = secondaryOutputHeldRef.current ? shortcutModifierKeys(holdShortcut) : [];
      const trackShortcut = shortcutFromKeyboardEvent(event, ignoredModifiers, true);
      const index = trackIndexFromKeyboardEvent(event);
      const track = index === undefined ? undefined : visibleTracks[index];
      if (!track || !trackShortcut) return;
      if (trackShortcut === resolvePrimaryShortcut(projectShortcut(detail.project, 'crossfadeTrackShortcut'))) return run(() => runTrackAction('crossfade', track));
      if (trackShortcut === resolvePrimaryShortcut(projectShortcut(detail.project, 'startTrackShortcut'))) run(() => runTrackAction(detail.project.keyboardAction ?? 'start', track));
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const released = shortcutFromKeyboardEvent(event);
      if (released && shortcutMainKey(released) === shortcutMainKey(resolvePrimaryShortcut(holdShortcut))) secondaryOutputHeldRef.current = false;
    };
    const resetHeldOutput = () => { secondaryOutputHeldRef.current = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', resetHeldOutput);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', resetHeldOutput);
      resetHeldOutput();
    };
  }, [detail, displayedCategories, preloadCategory, runTrackAction, secondaryBridgeOutputId, selectedCategoryId, selectionMode, selectCategory, sendOrRun, visibleTracks]);

  async function createProject() {
    const name = window.prompt('Nom du nouveau spectacle');
    if (!name?.trim()) return;
    try {
      const { project } = await api.createProject(name);
      await loadProjects();
      chooseProject(project.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Création impossible.'); }
  }

  async function createCategory() {
    if (!detail) return;
    const name = window.prompt('Nom de la catégorie');
    if (!name?.trim()) return;
    try {
      await api.createCategory(detail.project.id, name, colors[detail.categories.length % colors.length], detail.categories.length);
      await refreshProject();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Création impossible.'); }
  }

  async function deleteCategory(category: Category) {
    if (!detail) return;
    const trackCount = detail.tracks.filter((track) => track.categoryId === category.id).length;
    const consequence = trackCount > 0 ? `\n\n${trackCount} morceau${trackCount > 1 ? 'x' : ''} restera${trackCount > 1 ? 'ont' : ''} disponible${trackCount > 1 ? 's' : ''} dans « Tous les sons », sans catégorie.` : '';
    if (!window.confirm(`Supprimer la catégorie « ${category.name} » ?${consequence}`)) return;
    try {
      await api.deleteCategory(detail.project.id, category.id);
      if (selectedCategoryId === category.id) {
        localStorage.removeItem(categoryStorageKey(detail.project.id));
        setSelectedCategoryId('all');
      }
      await refreshProject();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Suppression de la catégorie impossible.'); }
  }

  async function reorderCategories(categoryId: string, targetId?: string, after = false) {
    if (!detail || reordering || categoryId === targetId) return;
    const previous = detail.categories;
    const reordered = moveById(previous, categoryId, targetId, after).map((category, position) => ({ ...category, position }));
    setDetail((current) => current ? { ...current, categories: reordered } : current);
    setReordering(true);
    try {
      const result = await api.reorderCategories(detail.project.id, reordered.map((category) => category.id));
      setDetail((current) => current ? { ...current, categories: result.categories } : current);
    } catch (cause) {
      setDetail((current) => current ? { ...current, categories: previous } : current);
      setError(cause instanceof Error ? cause.message : 'Réorganisation des catégories impossible.');
    } finally {
      setReordering(false);
      setDraggedCategoryId(undefined);
      setDropCategoryOrderId(undefined);
      setDropCategoryAfter(false);
    }
  }

  async function createProjectColor(color: string) {
    if (!detail || detail.project.id !== selectedProjectId) throw new Error('La palette du spectacle est encore en cours de chargement.');
    try {
      const { projectColor } = await api.createProjectColor(detail.project.id, color);
      setDetail((current) => current ? {
        ...current,
        colors: current.colors.some((item) => item.id === projectColor.id) ? current.colors : [...current.colors, projectColor],
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ajout de la couleur impossible.');
      throw cause;
    }
  }

  async function deleteProjectColor(projectColor: ProjectColor) {
    if (!detail || detail.project.id !== selectedProjectId) throw new Error('La palette du spectacle est encore en cours de chargement.');
    const previous = detail.colors;
    setDetail((current) => current ? { ...current, colors: current.colors.filter((item) => item.id !== projectColor.id) } : current);
    try {
      await api.deleteProjectColor(detail.project.id, projectColor.id);
    } catch (cause) {
      setDetail((current) => current ? { ...current, colors: previous } : current);
      setError(cause instanceof Error ? cause.message : 'Suppression de la couleur impossible.');
      throw cause;
    }
  }

  async function reorderProjectColors(colorIds: string[]) {
    if (!detail || detail.project.id !== selectedProjectId) throw new Error('La palette du spectacle est encore en cours de chargement.');
    const previous = detail.colors;
    const byId = new Map(previous.map((item) => [item.id, item]));
    const optimistic = colorIds.flatMap((id, position) => {
      const item = byId.get(id);
      return item ? [{ ...item, position }] : [];
    });
    setDetail((current) => current ? { ...current, colors: optimistic } : current);
    try {
      const result = await api.reorderProjectColors(detail.project.id, colorIds);
      setDetail((current) => current ? { ...current, colors: result.colors } : current);
    } catch (cause) {
      setDetail((current) => current ? { ...current, colors: previous } : current);
      setError(cause instanceof Error ? cause.message : 'Réorganisation des couleurs impossible.');
      throw cause;
    }
  }

  async function reorderProjects(projectIds: string[]) {
    const previous = projects;
    const byId = new Map(previous.map((project) => [project.id, project]));
    const optimistic = projectIds.flatMap((id, position) => {
      const project = byId.get(id);
      return project ? [{ ...project, position }] : [];
    });
    setProjects(optimistic);
    try {
      const result = await api.reorderProjects(projectIds);
      setProjects(result.projects);
      localStorage.setItem('sonoriva-projects', JSON.stringify(result));
    } catch (cause) {
      setProjects(previous);
      setError(cause instanceof Error ? cause.message : 'Réorganisation des spectacles impossible.');
    }
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`Supprimer définitivement le spectacle « ${project.name} » et tous ses morceaux ?\n\nCette action est irréversible.`)) return;
    try {
      let deletedTrackIds = project.id === detail?.project.id ? detail.tracks.map((track) => track.id) : [];
      if (deletedTrackIds.length === 0) {
        const projectToDelete = await api.project(project.id).catch(() => undefined);
        deletedTrackIds = projectToDelete?.tracks.map((track) => track.id) ?? [];
      }
      if (project.id === selectedProjectId) { audioEngine.stopAll(detail?.tracks ?? [], 0); resetPlaylistEditor(); }
      await api.deleteProject(project.id);
      if (project.id === selectedProjectId) setDetail(undefined);
      audioEngine.resetHistory(deletedTrackIds);
      await deleteCachedTracks(deletedTrackIds).catch(() => undefined);
      localStorage.removeItem(`sonoriva-detail:${project.id}`);
      localStorage.removeItem(categoryStorageKey(project.id));
      localStorage.removeItem(stopwatchStorageKey(project.id));
      await loadProjects();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Suppression du spectacle impossible.'); }
  }

  async function updateMouseAction(side: 'left' | 'right' | 'keyboard', action: MouseAction) {
    if (!detail) return;
    const input = side === 'left' ? { leftClickAction: action }
      : side === 'right' ? { rightClickAction: action }
        : { keyboardAction: action };
    try {
      const { project } = await api.updateProjectActions(detail.project.id, input);
      setDetail((current) => current ? { ...current, project } : current);
      setProjects((current) => current.map((candidate) => candidate.id === project.id ? project : candidate));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Configuration impossible.'); }
  }

  async function updateKeyAction(key: 'escape' | 'backspace' | 'shift-backspace' | 'space', action: KeyAction) {
    if (!detail) return;
    const input = key === 'escape' ? { escapeKeyAction: action }
      : key === 'backspace' ? { backspaceKeyAction: action }
        : key === 'shift-backspace' ? { shiftBackspaceKeyAction: action }
          : { spaceKeyAction: action };
    try {
      const { project } = await api.updateProjectActions(detail.project.id, input);
      setDetail((current) => current ? { ...current, project } : current);
      setProjects((current) => current.map((candidate) => candidate.id === project.id ? project : candidate));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Configuration impossible.'); }
  }

  async function updateKeyboardShortcut(key: ProjectKeyboardShortcutKey, shortcut: string) {
    if (!detail) return;
    const conflict = projectShortcutDefinitions.find((definition) => definition.key !== key && resolvePrimaryShortcut(projectShortcut(detail.project, definition.key)) === resolvePrimaryShortcut(shortcut));
    if (conflict) {
      setError(`Cette combinaison est déjà utilisée pour « ${conflict.label} ».`);
      return;
    }
    const reservedStopKey = shortcut === 'Escape' ? detail.project.escapeKeyAction
      : shortcut === 'Shift+Backspace' ? detail.project.shiftBackspaceKeyAction
        : shortcut === 'Backspace' ? detail.project.backspaceKeyAction
          : shortcut === 'Space' ? detail.project.spaceKeyAction : 'none';
    if (reservedStopKey !== 'none') {
      setError('Cette touche est encore affectée à une commande d’arrêt globale. Sélectionnez d’abord « Aucune action ».');
      return;
    }
    try {
      const input = { [key]: shortcut } as Partial<Pick<Project, ProjectKeyboardShortcutKey>>;
      const { project } = await api.updateProjectActions(detail.project.id, input);
      setDetail((current) => current ? { ...current, project } : current);
      setProjects((current) => current.map((candidate) => candidate.id === project.id ? project : candidate));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Configuration impossible.'); }
  }

  async function updatePlaylistGroupLimit(maxPlaylistGroupSize: number) {
    if (!detail) return;
    if (playlistQueueRows.some((row) => row.items.length > maxPlaylistGroupSize)) {
      setError('La playlist ouverte contient déjà une rangée plus grande que cette limite.');
      return;
    }
    try {
      const { project } = await api.updateProjectActions(detail.project.id, { maxPlaylistGroupSize });
      setDetail((current) => current ? { ...current, project } : current);
      setProjects((current) => current.map((candidate) => candidate.id === project.id ? project : candidate));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Configuration des playlists impossible.'); }
  }

  async function updatePlaybackSettings(input: { maxActivePlaybacks?: number; compactPlaybackThreshold?: number }) {
    if (!detail) return;
    try {
      const { project } = await api.updateProjectActions(detail.project.id, input);
      setDetail((current) => current ? { ...current, project } : current);
      setProjects((current) => current.map((candidate) => candidate.id === project.id ? project : candidate));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Configuration de la colonne de lecture impossible.'); }
  }

  async function reorderTrack(trackId: string, categoryId: string | null, beforeTrackId?: string, subcategoryId: string | null = null) {
    if (!detail || reordering || trackId === beforeTrackId) return;
    const previousTracks = detail.tracks;
    const moving = previousTracks.find((track) => track.id === trackId);
    if (!moving) return;
    const reordered = previousTracks.filter((track) => track.id !== trackId);
    let destinationIndex = beforeTrackId ? reordered.findIndex((track) => track.id === beforeTrackId) : -1;
    if (destinationIndex < 0) destinationIndex = reordered.reduce((last, track, index) => track.categoryId === categoryId ? index + 1 : last, reordered.length);
    reordered.splice(destinationIndex, 0, { ...moving, categoryId, subcategoryId });
    const optimistic = reordered.map((track, position) => ({ ...track, position }));
    setDetail((current) => current ? { ...current, tracks: optimistic } : current);
    setReordering(true);
    try {
      const result = await api.reorderTrack(trackId, { categoryId, beforeTrackId, subcategoryId });
      setDetail((current) => current ? { ...current, tracks: result.tracks } : current);
      localStorage.setItem(`sonoriva-detail:${detail.project.id}`, JSON.stringify({ ...detail, tracks: result.tracks }));
    } catch (cause) {
      setDetail((current) => current ? { ...current, tracks: previousTracks } : current);
      setError(cause instanceof Error ? cause.message : 'Réorganisation impossible.');
    } finally {
      setReordering(false);
      setDraggedTrackId(undefined);
      setDropTrackId(undefined);
      setDropTrackPlacement(undefined);
      setDropSubcategoryId(undefined);
      setDropCategoryId(undefined);
    }
  }

  function mergeUpdatedTracks(updatedTracks: Track[]) {
    const updates = new Map(updatedTracks.map((track) => [track.id, track]));
    setDetail((current) => current ? { ...current, tracks: current.tracks.map((track) => updates.get(track.id) ?? track) } : current);
  }

  async function createSubcategoryFromTracks(sourceTrack: Track, targetTrack: Track) {
    if (!detail || reordering || sourceTrack.id === targetTrack.id) return;
    if (targetTrack.subcategoryId) return moveTrackIntoSubcategory(sourceTrack.id, targetTrack.subcategoryId);
    setReordering(true);
    try {
      const category = detail.categories.find((item) => item.id === targetTrack.categoryId);
      const result = await api.createTrackSubcategory(detail.project.id, {
        name: 'Nouveau groupe',
        categoryId: targetTrack.categoryId,
        color: targetTrack.color ?? category?.color ?? detail.colors[0]?.color ?? '#8b5cf6',
        trackIds: [targetTrack.id, sourceTrack.id],
      });
      setDetail((current) => current ? { ...current, subcategories: [...current.subcategories, result.subcategory], tracks: current.tracks.map((track) => result.tracks.find((updated) => updated.id === track.id) ?? track) } : current);
      setOpenSubcategoryId(result.subcategory.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Création de la sous-catégorie impossible.');
    } finally {
      setReordering(false);
      setDraggedTrackId(undefined);
      setDropTrackId(undefined);
      setDropTrackPlacement(undefined);
    }
  }

  async function createSubcategoryFromSelectedTracks(targetTrack: Track) {
    if (!detail || reordering || selectedTrackIds.size === 0 || selectedTrackIds.has(targetTrack.id)) return;
    if (targetTrack.subcategoryId) return moveSelectedTracks(targetTrack.categoryId, targetTrack.subcategoryId);
    setReordering(true);
    try {
      const category = detail.categories.find((item) => item.id === targetTrack.categoryId);
      const result = await api.createTrackSubcategory(detail.project.id, {
        name: 'Nouvelle sous-catégorie',
        categoryId: targetTrack.categoryId,
        color: targetTrack.color ?? category?.color ?? detail.colors[0]?.color ?? '#8b5cf6',
        trackIds: [targetTrack.id, ...selectedTrackIds],
      });
      setDetail((current) => current ? { ...current, subcategories: [...current.subcategories, result.subcategory], tracks: current.tracks.map((track) => result.tracks.find((updated) => updated.id === track.id) ?? track) } : current);
      setOpenSubcategoryId(result.subcategory.id);
      setSelectionMode(false);
      setSelectedTrackIds(new Set());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Création de la sous-catégorie impossible.');
    } finally {
      setReordering(false);
      setDraggedTrackId(undefined);
      setDropTrackId(undefined);
      setDropTrackPlacement(undefined);
      setDropSubcategoryId(undefined);
    }
  }

  async function moveTrackIntoSubcategory(trackId: string, subcategoryId: string) {
    if (!detail || reordering) return;
    const subcategory = detail.subcategories.find((item) => item.id === subcategoryId);
    const track = detail.tracks.find((item) => item.id === trackId);
    if (!subcategory || !track || track.subcategoryId === subcategoryId) return;
    setReordering(true);
    try {
      const result = await api.moveTrackToSubcategory(detail.project.id, trackId, subcategoryId);
      mergeUpdatedTracks([result.track]);
      setOpenSubcategoryId(subcategoryId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Déplacement vers la sous-catégorie impossible.');
    } finally {
      setReordering(false);
      setDraggedTrackId(undefined);
      setDropTrackId(undefined);
      setDropTrackPlacement(undefined);
      setDropSubcategoryId(undefined);
    }
  }

  async function moveSelectedTracks(categoryId: string | null, subcategoryId: string | null) {
    if (!detail || reordering || selectedTrackIds.size === 0) return;
    setReordering(true);
    try {
      const result = await api.batchUpdateTracks({
        projectId: detail.project.id,
        trackIds: [...selectedTrackIds],
        updates: { categoryId, subcategoryId },
      });
      mergeUpdatedTracks(result.tracks);
      setSelectionMode(false);
      setSelectedTrackIds(new Set());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Déplacement de la sélection impossible.');
    } finally {
      cancelScheduledSubcategoryOpen();
      setReordering(false);
      setDraggedTrackId(undefined);
      setDropTrackId(undefined);
      setDropTrackPlacement(undefined);
      setDropSubcategoryId(undefined);
      setDropCategoryId(undefined);
    }
  }

  async function saveSubcategory(input: { name: string; categoryId: string | null; color: string }) {
    if (!detail || !subcategoryDialog) return;
    if (subcategoryDialog === 'new') {
      const result = await api.createTrackSubcategory(detail.project.id, input);
      setDetail((current) => current ? { ...current, subcategories: [...current.subcategories, result.subcategory] } : current);
      setOpenSubcategoryId(result.subcategory.id);
    } else {
      const result = await api.updateTrackSubcategory(detail.project.id, subcategoryDialog.id, input);
      setDetail((current) => current ? { ...current, subcategories: current.subcategories.map((item) => item.id === result.subcategory.id ? result.subcategory : item), tracks: current.tracks.map((track) => result.tracks.find((updated) => updated.id === track.id) ?? track) } : current);
    }
    setSubcategoryDialog(undefined);
  }

  async function deleteSubcategory(subcategory: TrackSubcategory) {
    if (!detail) return;
    const result = await api.deleteTrackSubcategory(detail.project.id, subcategory.id);
    setDetail((current) => current ? { ...current, subcategories: current.subcategories.filter((item) => item.id !== subcategory.id), tracks: current.tracks.map((track) => result.tracks.find((updated) => updated.id === track.id) ?? track) } : current);
    if (openSubcategoryId === subcategory.id) setOpenSubcategoryId(undefined);
    setSubcategoryDialog(undefined);
  }

  async function renameSubcategory(subcategory: TrackSubcategory, nextName: string) {
    if (!detail) return;
    const name = nextName.trim();
    setEditingSubcategoryName(false);
    if (!name || name === subcategory.name) {
      setSubcategoryNameDraft(subcategory.name);
      return;
    }
    try {
      const result = await api.updateTrackSubcategory(detail.project.id, subcategory.id, { name });
      setDetail((current) => current ? { ...current, subcategories: current.subcategories.map((item) => item.id === result.subcategory.id ? result.subcategory : item) } : current);
      setSubcategoryNameDraft(result.subcategory.name);
    } catch (cause) {
      setSubcategoryNameDraft(subcategory.name);
      setError(cause instanceof Error ? cause.message : 'Renommage de la sous-catégorie impossible.');
    }
  }

  function scheduleSubcategoryOpen(subcategoryId: string) {
    if (!openSubcategoriesOnDrag || openSubcategoryId === subcategoryId || subcategoryOpenTimerRef.current?.id === subcategoryId) return;
    if (subcategoryOpenTimerRef.current) window.clearTimeout(subcategoryOpenTimerRef.current.timer);
    const timer = window.setTimeout(() => {
      setOpenSubcategoryId(subcategoryId);
      subcategoryOpenTimerRef.current = undefined;
    }, 550);
    subcategoryOpenTimerRef.current = { id: subcategoryId, timer };
  }

  function cancelScheduledSubcategoryOpen(subcategoryId?: string) {
    const pending = subcategoryOpenTimerRef.current;
    if (!pending || (subcategoryId && pending.id !== subcategoryId)) return;
    window.clearTimeout(pending.timer);
    subcategoryOpenTimerRef.current = undefined;
  }

  async function reorderPlaylist(playlistId: string, targetKind: 'track' | 'playlist' | 'subcategory', targetId: string, afterTarget: boolean) {
    if (!detail || reordering || (targetKind === 'playlist' && playlistId === targetId)) return;
    const previousPlaylists = detail.playlists;
    const moving = previousPlaylists.find((playlist) => playlist.id === playlistId);
    if (!moving) return;
    const orderedItems = visibleBoardItems.filter((item) => item.kind !== 'playlist' || item.id !== playlistId);
    const targetIndex = orderedItems.findIndex((item) => item.kind === targetKind && item.id === targetId);
    if (targetIndex < 0) return;
    const target = orderedItems[targetIndex]!;
    const categoryId = target.kind === 'track' ? target.track.categoryId : target.kind === 'playlist' ? target.playlist.categoryId : target.subcategory.categoryId;
    const movedPlaylist = { ...moving, categoryId };
    const destinationIndex = targetIndex + (afterTarget ? 1 : 0);
    orderedItems.splice(destinationIndex, 0, { kind: 'playlist', id: movedPlaylist.id, position: movedPlaylist.position, playlist: movedPlaylist });
    const movingIndex = orderedItems.findIndex((item) => item.kind === 'playlist' && item.id === playlistId);
    const previousPosition = orderedItems[movingIndex - 1]?.position;
    const nextPosition = orderedItems[movingIndex + 1]?.position;
    const position = previousPosition === undefined ? (nextPosition ?? 0) - 1
      : nextPosition === undefined ? previousPosition + 1
        : previousPosition + (nextPosition - previousPosition) / 2;
    const optimistic = previousPlaylists.map((playlist) => playlist.id === playlistId ? { ...playlist, categoryId, position } : playlist)
      .sort((first, second) => first.position - second.position);
    setDetail((current) => current ? { ...current, playlists: optimistic } : current);
    setReordering(true);
    try {
      await api.positionPlaylist(detail.project.id, playlistId, position, categoryId);
      localStorage.setItem(`sonoriva-detail:${detail.project.id}`, JSON.stringify({ ...detail, playlists: optimistic }));
    } catch (cause) {
      setDetail((current) => current ? { ...current, playlists: previousPlaylists } : current);
      setError(cause instanceof Error ? cause.message : 'Réorganisation des playlists impossible.');
    } finally {
      setReordering(false);
      setDraggedPlaylistId(undefined);
      setDropPlaylistId(undefined);
      setDropPlaylistTrackId(undefined);
      setDropSubcategoryPositionId(undefined);
      setDropPlaylistAfter(false);
    }
  }

  async function reorderSubcategory(subcategoryId: string, targetKind: 'track' | 'playlist' | 'subcategory', targetId: string, afterTarget: boolean) {
    if (!detail || reordering || (targetKind === 'subcategory' && subcategoryId === targetId)) return;
    const previousSubcategories = detail.subcategories;
    const moving = previousSubcategories.find((subcategory) => subcategory.id === subcategoryId);
    if (!moving) return;
    const orderedItems = visibleBoardItems.filter((item) => item.kind !== 'subcategory' || item.id !== subcategoryId);
    const targetIndex = orderedItems.findIndex((item) => item.kind === targetKind && item.id === targetId);
    if (targetIndex < 0) return;
    const target = orderedItems[targetIndex]!;
    const categoryId = target.kind === 'track' ? target.track.categoryId : target.kind === 'playlist' ? target.playlist.categoryId : target.subcategory.categoryId;
    const movedSubcategory = { ...moving, categoryId };
    orderedItems.splice(targetIndex + (afterTarget ? 1 : 0), 0, { kind: 'subcategory', id: movedSubcategory.id, position: movedSubcategory.position, subcategory: movedSubcategory });
    const movingIndex = orderedItems.findIndex((item) => item.kind === 'subcategory' && item.id === subcategoryId);
    const previousPosition = orderedItems[movingIndex - 1]?.position;
    const nextPosition = orderedItems[movingIndex + 1]?.position;
    const position = previousPosition === undefined ? (nextPosition ?? 0) - 1
      : nextPosition === undefined ? previousPosition + 1
        : previousPosition + (nextPosition - previousPosition) / 2;
    setDetail((current) => current ? { ...current, subcategories: current.subcategories.map((subcategory) => subcategory.id === subcategoryId ? { ...subcategory, categoryId, position } : subcategory).sort((first, second) => first.position - second.position) } : current);
    setReordering(true);
    try {
      const result = await api.updateTrackSubcategory(detail.project.id, subcategoryId, { categoryId, position });
      setDetail((current) => current ? { ...current, subcategories: current.subcategories.map((subcategory) => subcategory.id === result.subcategory.id ? result.subcategory : subcategory), tracks: current.tracks.map((track) => result.tracks.find((updated) => updated.id === track.id) ?? track) } : current);
    } catch (cause) {
      setDetail((current) => current ? { ...current, subcategories: previousSubcategories } : current);
      setError(cause instanceof Error ? cause.message : 'Réorganisation de la sous-catégorie impossible.');
    } finally {
      setReordering(false);
      setDraggedTrackSubcategoryId(undefined);
      setDropPlaylistId(undefined);
      setDropPlaylistTrackId(undefined);
      setDropSubcategoryPositionId(undefined);
      setDropPlaylistAfter(false);
    }
  }

  async function movePlaylistToCategory(playlistId: string, categoryId: string) {
    if (!detail || reordering) return;
    const previousPlaylists = detail.playlists;
    const moving = previousPlaylists.find((playlist) => playlist.id === playlistId);
    if (!moving || moving.categoryId === categoryId) return;
    const positions = [
      ...detail.tracks.filter((track) => track.categoryId === categoryId).map((track) => track.position),
      ...detail.playlists.filter((playlist) => playlist.categoryId === categoryId && playlist.id !== playlistId).map((playlist) => playlist.position),
      ...detail.subcategories.filter((subcategory) => subcategory.categoryId === categoryId).map((subcategory) => subcategory.position),
    ];
    const position = Math.max(-1, ...positions) + 1;
    const optimistic = previousPlaylists.map((playlist) => playlist.id === playlistId ? { ...playlist, categoryId, position } : playlist);
    setDetail((current) => current ? { ...current, playlists: optimistic } : current);
    setReordering(true);
    try {
      await api.positionPlaylist(detail.project.id, playlistId, position, categoryId);
      localStorage.setItem(`sonoriva-detail:${detail.project.id}`, JSON.stringify({ ...detail, playlists: optimistic }));
    } catch (cause) {
      setDetail((current) => current ? { ...current, playlists: previousPlaylists } : current);
      setError(cause instanceof Error ? cause.message : 'Déplacement de la playlist impossible.');
    } finally {
      setReordering(false);
      setDraggedPlaylistId(undefined);
      setDropCategoryId(undefined);
    }
  }

  async function moveSubcategoryToCategory(subcategoryId: string, categoryId: string) {
    if (!detail || reordering) return;
    const previousSubcategories = detail.subcategories;
    const moving = previousSubcategories.find((subcategory) => subcategory.id === subcategoryId);
    if (!moving || moving.categoryId === categoryId) return;
    const positions = [
      ...detail.tracks.filter((track) => track.categoryId === categoryId && !track.subcategoryId).map((track) => track.position),
      ...detail.playlists.filter((playlist) => playlist.categoryId === categoryId).map((playlist) => playlist.position),
      ...detail.subcategories.filter((subcategory) => subcategory.categoryId === categoryId && subcategory.id !== subcategoryId).map((subcategory) => subcategory.position),
    ];
    const position = Math.max(-1, ...positions) + 1;
    setReordering(true);
    try {
      const result = await api.updateTrackSubcategory(detail.project.id, subcategoryId, { categoryId, position });
      setDetail((current) => current ? { ...current, subcategories: current.subcategories.map((subcategory) => subcategory.id === subcategoryId ? result.subcategory : subcategory), tracks: current.tracks.map((track) => result.tracks.find((updated) => updated.id === track.id) ?? track) } : current);
    } catch (cause) {
      setDetail((current) => current ? { ...current, subcategories: previousSubcategories } : current);
      setError(cause instanceof Error ? cause.message : 'Déplacement de la sous-catégorie impossible.');
    } finally {
      setReordering(false);
      setDraggedTrackSubcategoryId(undefined);
      setDropCategoryId(undefined);
    }
  }

  function chooseProject(id: string) {
    audioEngine.stopAll(detail?.tracks ?? []);
    resetPlaylistEditor();
    setSelectedProjectId(id);
    setSelectedCategoryId('all');
    setReorderMode(false);
    setSidebarOpen(false);
    localStorage.setItem('sonoriva-project', id);
  }

  function toggleSelectionMode() {
    const next = !selectionMode;
    setSelectionMode(next);
    setReorderMode(false);
    setCategoryManageMode(false);
    setColumnsOpen(false);
    setHistoryOpen(false);
    setSelectionRectangle(undefined);
    if (!next) setSelectedTrackIds(new Set());
  }

  function toggleSearchScope(scope: SearchScope) {
    setSearchScopes((current) => toggleSearchScopeSelection(current, scope));
  }

  function toggleTrackSelection(trackId: string) {
    if (suppressSelectionClick.current) return;
    setSelectedTrackIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId); else next.add(trackId);
      return next;
    });
  }

  function beginMarqueeSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (!selectionMode || event.pointerType !== 'mouse' || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('.track-pad.is-selected')) return;
    marqueeStart.current = {
      x: event.clientX,
      y: event.clientY,
      additive: event.metaKey || event.ctrlKey || event.shiftKey,
      selectedIds: new Set(selectedTrackIds),
    };
    marqueeMoved.current = false;
  }

  function moveMarqueeSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const start = marqueeStart.current;
    if (!start) return;
    if (!marqueeMoved.current && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return;
    marqueeMoved.current = true;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    const rectangle = { startX: start.x, startY: start.y, currentX: event.clientX, currentY: event.clientY };
    setSelectionRectangle(rectangle);
    const intersectingIds = new Set<string>();
    event.currentTarget.querySelectorAll<HTMLElement>('[data-track-id]').forEach((element) => {
      const bounds = element.getBoundingClientRect();
      if (intersectsSelection(bounds, rectangle)) {
        const trackId = element.dataset.trackId;
        if (trackId) intersectingIds.add(trackId);
      }
    });
    setSelectedTrackIds(start.additive ? new Set([...start.selectedIds, ...intersectingIds]) : intersectingIds);
  }

  function endMarqueeSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (!marqueeStart.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (marqueeMoved.current) {
      suppressSelectionClick.current = true;
      window.setTimeout(() => { suppressSelectionClick.current = false; }, 0);
    }
    marqueeStart.current = undefined;
    marqueeMoved.current = false;
    setSelectionRectangle(undefined);
  }

  function applyBatchTrackChanges(updatedTracks: Track[]) {
    const updatedById = new Map(updatedTracks.map((track) => [track.id, track]));
    setDetail((current) => {
      if (!current) return current;
      const next = { ...current, tracks: current.tracks.map((track) => updatedById.get(track.id) ?? track) };
      localStorage.setItem(`sonoriva-detail:${current.project.id}`, JSON.stringify(next));
      return next;
    });
    setBatchEditOpen(false);
    setSelectionMode(false);
    setSelectedTrackIds(new Set());
  }

  async function cacheOffline() {
    if (!detail || !('caches' in window)) return setOfflineStatus('Cache indisponible dans ce navigateur.');
    setOfflineStatus(`0/${detail.tracks.length}`);
    try {
      let done = 0;
      for (const track of detail.tracks) {
        await cacheTrackOffline(track.id);
        done += 1;
        setOfflineTrackIds((current) => new Set(current).add(track.id));
        setOfflineStatus(`${done}/${detail.tracks.length}`);
      }
      setOfflineStatus('Projet disponible hors ligne');
    } catch { setOfflineStatus('Téléchargement interrompu'); }
  }

  function updateTrackColumns(value: number) {
    if (!detail) return;
    if (soundboardView === 'list') {
      updateSoundboardViewSettings(compactLayout ? { mobileListColumns: value } : { desktopListColumns: value });
      return;
    }
    if (compactLayout) {
      setMobileColumns(value);
      localStorage.setItem(trackColumnsStorageKey(detail.project.id, columnCategoryId, true), String(value));
    } else {
      setDesktopColumns(value);
      localStorage.setItem(trackColumnsStorageKey(detail.project.id, columnCategoryId, false), String(value));
    }
  }

  function updateSoundboardViewSettings(patch: Partial<SoundboardViewSettings>) {
    if (!detail) return;
    setSoundboardViewSettings((current) => {
      const next = { ...current, ...patch };
      localStorage.setItem(soundboardViewStorageKey(detail.project.id), JSON.stringify(next));
      return next;
    });
  }

  function updateSoundboardViewMode(mode: SoundboardViewMode) {
    if (!detail) return;
    setSoundboardViewSettings((current) => {
      const next = applySoundboardViewMode(current, mode, effectiveSoundboardViewScope === 'category' ? selectedCategoryId : undefined);
      localStorage.setItem(soundboardViewStorageKey(detail.project.id), JSON.stringify(next));
      return next;
    });
  }

  function applySoundboardViewToAll() {
    if (!detail) return;
    setSoundboardViewScope('all');
    setSoundboardViewSettings((current) => {
      const next = applySoundboardViewMode(current, soundboardViewMode);
      localStorage.setItem(soundboardViewStorageKey(detail.project.id), JSON.stringify(next));
      return next;
    });
  }

  function resetPlaybackProgress(scope: 'category' | 'project') {
    if (!detail) return;
    const trackIds = scope === 'category' && currentCategory
      ? detail.tracks.filter((track) => track.categoryId === currentCategory.id).map((track) => track.id)
      : detail.tracks.map((track) => track.id);
    audioEngine.resetHistory(trackIds);
    setHistoryOpen(false);
  }

  function resetCurrentProject() {
    if (!detail) return;
    const confirmed = window.confirm(`Réinitialiser « ${detail.project.name} » ?\n\nLes lectures en cours, les progressions, le chronomètre, la catégorie active et les réglages temporaires seront remis à zéro.\n\nLes morceaux, catégories, couleurs et fichiers hors ligne seront conservés.`);
    if (!confirmed) return;
    window.dispatchEvent(new Event('sonoriva:stop-temporary-audio'));
    audioEngine.resetProjectSession(detail.tracks);
    resetPlaylistEditor();
    setChronoElapsedMs(0);
    setChronoStartedAt(undefined);
    localStorage.removeItem(stopwatchStorageKey(detail.project.id));
    const firstCategoryId = detail.categories[0]?.id ?? 'all';
    setSelectedCategoryId(firstCategoryId);
    localStorage.setItem(categoryStorageKey(detail.project.id), firstCategoryId);
    setSearch('');
    setNextTrackVolume(100);
    setKeepNextTrackVolume(false);
    localStorage.removeItem('sonoriva-next-volume');
    localStorage.removeItem('sonoriva-keep-next-volume');
    setReorderMode(false);
    setCategoryManageMode(false);
    setDraggedTrackId(undefined);
    setDropTrackId(undefined);
    setDropCategoryId(undefined);
    setDraggedCategoryId(undefined);
    setDropCategoryOrderId(undefined);
    setDropCategoryAfter(false);
    setColumnsOpen(false);
    setHistoryOpen(false);
  }

  function toggleChrono() {
    if (chronoStartedAt !== undefined) {
      const elapsedMs = chronoElapsedMs + Date.now() - chronoStartedAt;
      setChronoElapsedMs(elapsedMs);
      setChronoStartedAt(undefined);
      persistStopwatch(selectedProjectId, elapsedMs);
    } else {
      const startedAt = Date.now();
      setChronoStartedAt(startedAt);
      persistStopwatch(selectedProjectId, chronoElapsedMs, startedAt);
    }
  }

  function resetChrono() {
    setChronoElapsedMs(0);
    const startedAt = chronoStartedAt === undefined ? undefined : Date.now();
    if (startedAt !== undefined) setChronoStartedAt(startedAt);
    persistStopwatch(selectedProjectId, 0, startedAt);
  }

  function toggleRemoteMode() {
    if (!remoteControlEnabled) {
      setError('La télécommande n’est pas incluse dans votre forfait.');
      return;
    }
    const url = new URL(window.location.href);
    if (remote) url.searchParams.delete('remote'); else url.searchParams.set('remote', '1');
    window.location.href = url.toString();
  }

  async function logout() {
    audioEngine.stopAll(detail?.tracks ?? []);
    bridgeClient.forgetAssociation();
    audioEngine.resetHistory();
    resetPlaylistEditor();
    await api.logout();
    await deleteOfflineAudio().catch(() => false);
    for (const key of Object.keys(localStorage)) {
      if ((key.startsWith('sonoriva-') || key.startsWith('sonoriva:')) && !key.startsWith('sonoriva-track-columns')) localStorage.removeItem(key);
    }
    setUser(null); setDetail(undefined); setProjects([]);
  }

  async function resetDemo() {
    await api.resetDemo();
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sonoriva-') || key.startsWith('sonoriva:')) localStorage.removeItem(key);
    }
    window.location.reload();
  }

  async function createAccountFromDemo() {
    await logout();
    window.location.href = '/?register=1';
  }

  async function leaveDemoForLogin() {
    await logout();
    window.history.replaceState({}, '', '/');
  }

  function openAudioOutputUpgrade() {
    if (user?.isDemo) {
      createAccountFromDemo().catch((cause) => setError(cause instanceof Error ? cause.message : 'Impossible d’afficher les forfaits.'));
      return;
    }
    setSettingsInitialSection('billing');
    setSettingsOpen(true);
  }

  function closeWhatsNew() {
    setWhatsNewOpen(false);
    if (!releaseInfo || releaseInfo.unseenVersions.length === 0) return;
    const version = releaseInfo.currentVersion;
    setReleaseInfo({ ...releaseInfo, unseenVersions: [] });
    api.markReleaseSeen(version).catch(() => setError('Impossible d’enregistrer la lecture des nouveautés.'));
  }

  function setAutomaticUpdatePreference(enabled: boolean) {
    setAutomaticUpdates(enabled);
    localStorage.setItem('sonoriva-automatic-updates', String(enabled));
  }

  function setOpenSubcategoriesOnDragPreference(enabled: boolean) {
    setOpenSubcategoriesOnDrag(enabled);
    localStorage.setItem('sonoriva-open-subcategories-on-drag', String(enabled));
    if (!enabled) cancelScheduledSubcategoryOpen();
  }

  if (user === undefined) return <div className="app-loader"><img className="brand-mark loader pulse" src="/sonoriva-logo.svg" alt="" /><span>SonoRiva</span></div>;
  if (!user) return <><AuthScreen onAuthenticated={(authenticated) => { localStorage.setItem('sonoriva-user', JSON.stringify(authenticated)); setUser(authenticated); }} />{error && <Toast message={error} onClose={() => setError('')} />}</>;

  const audioOutputUpgradeMode: AudioOutputUpgradeMode | undefined = user.isDemo
    ? 'demo'
    : bridgeAvailable !== false
      ? undefined
      : accountSummary?.accessStatus === 'trialing'
        ? 'trial'
        : accountSummary?.accessStatus === 'read_only' || accountSummary?.accessStatus === 'suspended'
          ? 'restricted'
      : 'free';
  const demoLimits = accountSummary?.demoLimits;

  function setMobileTrackDropTarget(target?: MobileTrackDropTarget) {
    const drag = mobileTrackDragRef.current;
    if (!drag) return;
    const previousTarget = drag.target;
    if (previousTarget?.kind === 'subcategory' && (target?.kind !== 'subcategory' || target.id !== previousTarget.id)) cancelScheduledSubcategoryOpen(previousTarget.id);
    drag.target = target;
    setDropTrackId(target?.kind === 'track' ? target.id : undefined);
    setDropTrackPlacement(target?.kind === 'track' ? target.placement : undefined);
    setDropSubcategoryId(target?.kind === 'subcategory' ? target.id : undefined);
    setDropCategoryId(target?.kind === 'category' ? target.id : undefined);
  }

  function beginMobileTrackDrag(track: Track, color: string, point: ClientPoint) {
    const selection = selectionMode && selectedTrackIds.has(track.id);
    if (!reorderMode && !selection) return;
    mobileTrackDragRef.current = { trackId: track.id, selection };
    setDraggedTrackId(track.id);
    setMobileTrackDragPreview({
      trackId: track.id,
      title: selection && selectedTrackIds.size > 1 ? `${selectedTrackIds.size} morceaux sélectionnés` : track.title,
      color,
      count: selection ? selectedTrackIds.size : 1,
      clientX: point.clientX,
      clientY: point.clientY,
    });
  }

  function moveMobileTrackDrag(point: ClientPoint) {
    const drag = mobileTrackDragRef.current;
    if (!drag) return;
    const scrollDelta = mobileTrackAutoScrollDelta(point.clientY, window.innerHeight);
    if (scrollDelta) window.scrollBy({ top: scrollDelta, behavior: 'auto' });
    const previewHalfWidth = Math.min(120, Math.max(80, (window.innerWidth - 32) / 2));
    setMobileTrackDragPreview((current) => current ? {
      ...current,
      clientX: Math.max(previewHalfWidth + 16, Math.min(window.innerWidth - previewHalfWidth - 16, point.clientX)),
      clientY: point.clientY,
    } : current);

    const hit = document.elementFromPoint(point.clientX, point.clientY);
    const trackElement = hit?.closest<HTMLElement>('[data-track-id]');
    const targetTrackId = trackElement?.dataset.trackId;
    if (trackElement && targetTrackId && targetTrackId !== drag.trackId && !(drag.selection && selectedTrackIds.has(targetTrackId))) {
      const bounds = trackElement.getBoundingClientRect();
      setMobileTrackDropTarget({
        kind: 'track',
        id: targetTrackId,
        placement: drag.selection ? 'group' : trackDropPlacement(point.clientX, bounds.left, bounds.width),
      });
      return;
    }

    const subcategoryElement = hit?.closest<HTMLElement>('[data-subcategory-id], [data-subcategory-drawer-id]');
    const subcategoryId = subcategoryElement?.dataset.subcategoryId ?? subcategoryElement?.dataset.subcategoryDrawerId;
    if (subcategoryId) {
      scheduleSubcategoryOpen(subcategoryId);
      setMobileTrackDropTarget({ kind: 'subcategory', id: subcategoryId });
      return;
    }

    const categoryId = hit?.closest<HTMLElement>('[data-category-id]')?.dataset.categoryId;
    setMobileTrackDropTarget(categoryId ? { kind: 'category', id: categoryId } : undefined);
  }

  function resetMobileTrackDrag() {
    cancelScheduledSubcategoryOpen();
    mobileTrackDragRef.current = undefined;
    setMobileTrackDragPreview(undefined);
    setDraggedTrackId(undefined);
    setDropTrackId(undefined);
    setDropTrackPlacement(undefined);
    setDropSubcategoryId(undefined);
    setDropCategoryId(undefined);
  }

  function finishMobileTrackDrag(point: ClientPoint, cancelled: boolean) {
    if (!cancelled) moveMobileTrackDrag(point);
    const drag = mobileTrackDragRef.current;
    const target = drag?.target;
    resetMobileTrackDrag();
    if (!drag || !target || cancelled || !detail) return;

    if (target.kind === 'category') {
      if (drag.selection) moveSelectedTracks(target.id, null).catch(() => undefined);
      else reorderTrack(drag.trackId, target.id).catch(() => undefined);
      return;
    }

    if (target.kind === 'subcategory') {
      const subcategory = detail.subcategories.find((item) => item.id === target.id);
      if (!subcategory) return;
      if (drag.selection) moveSelectedTracks(subcategory.categoryId, subcategory.id).catch(() => undefined);
      else moveTrackIntoSubcategory(drag.trackId, subcategory.id).catch(() => undefined);
      return;
    }

    const sourceTrack = detail.tracks.find((item) => item.id === drag.trackId);
    const targetTrack = detail.tracks.find((item) => item.id === target.id);
    if (!sourceTrack || !targetTrack) return;
    if (drag.selection) {
      createSubcategoryFromSelectedTracks(targetTrack).catch(() => undefined);
      return;
    }
    if (target.placement === 'group') {
      if (targetTrack.subcategoryId) moveTrackIntoSubcategory(sourceTrack.id, targetTrack.subcategoryId).catch(() => undefined);
      else createSubcategoryFromTracks(sourceTrack, targetTrack).catch(() => undefined);
      return;
    }
    const beforeTrackId = target.placement === 'after' ? trackIdAfterTarget(detail.tracks, targetTrack) : targetTrack.id;
    reorderTrack(sourceTrack.id, targetTrack.categoryId, beforeTrackId, targetTrack.subcategoryId).catch(() => undefined);
  }

  function renderBoardTrack(track: Track) {
    const category = detail?.categories.find((item) => item.id === track.categoryId);
    const color = track.color ?? category?.color ?? '#71717a';
    const shortcutIndex = visibleTracks.findIndex((candidate) => candidate.id === track.id);
    const reorderPositionTarget = dropTrackId === track.id && dropTrackPlacement !== 'group' ? dropTrackPlacement : undefined;
    return <TrackPad key={track.id} track={track} color={color} active={activeTrackIds.has(track.id)} playbacks={playbacksByTrack.get(track.id) ?? []} historyProgress={playbackHistory.get(track.id) ?? 0} loaded={offlineTrackIds.has(track.id)} reorderEnabled={reorderMode} playlistDropEnabled={playlistsEnabled && !selectionMode && !remote} selectionMode={selectionMode} selected={selectedTrackIds.has(track.id)} dropTarget={dropTrackId === track.id && dropTrackPlacement === 'group'} dropLabel={track.subcategoryId ? 'Ajouter à la sous-catégorie' : 'Créer une sous-catégorie'} reorderPositionTarget={reorderPositionTarget} playlistPositionTarget={dropPlaylistTrackId === track.id ? (dropPlaylistAfter ? 'after' : 'before') : undefined} shortcut={trackShortcutLabel(shortcutIndex)} bridgeOutputs={remote || reorderMode || selectionMode ? [] : routedBridgeOutputs} mainBridgeOutputId={mainBridgeOutputId}
      onPrimary={() => detail && runTrackAction(detail.project.leftClickAction ?? 'start', track)}
      onOutputPlay={(outputId) => playTrackOnOutput(track, outputId)}
      onSecondary={() => detail && runTrackAction(detail.project.rightClickAction ?? 'crossfade', track)}
      onEdit={() => { if (!reorderMode) setEditingTrack(track); }}
      onSelect={() => toggleTrackSelection(track.id)}
      onDragStart={(event) => { if (selectionMode && selectedTrackIds.has(track.id)) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-sonoriva-track-selection', [...selectedTrackIds].join(',')); setSelectionDragImage(event, selectedTracks); setDraggedTrackId(track.id); } else if (reorderMode) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', track.id); setDraggedTrackId(track.id); } else if (!remote) { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/x-sonoriva-track', track.id); } }}
      onDragOver={(event) => {
        if (!reorderMode && !draggingSelectedTracks) return;
        if (draggedPlaylistId || draggedTrackSubcategoryId) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const bounds = event.currentTarget.getBoundingClientRect();
          setDropPlaylistTrackId(track.id);
          setDropPlaylistId(undefined);
          setDropPlaylistAfter(event.clientX > bounds.left + bounds.width / 2);
          return;
        }
        if (!draggedTrackId || draggedTrackId === track.id || (draggingSelectedTracks && selectedTrackIds.has(track.id))) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const bounds = event.currentTarget.getBoundingClientRect();
        setDropTrackId(track.id);
        setDropTrackPlacement(draggingSelectedTracks ? 'group' : trackDropPlacement(event.clientX, bounds.left, bounds.width));
        setDropSubcategoryId(undefined);
        setDropCategoryId(undefined);
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (draggedPlaylistId) {
          const bounds = event.currentTarget.getBoundingClientRect();
          reorderPlaylist(draggedPlaylistId, 'track', track.id, event.clientX > bounds.left + bounds.width / 2).catch(() => undefined);
          return;
        }
        if (draggedTrackSubcategoryId) {
          const bounds = event.currentTarget.getBoundingClientRect();
          reorderSubcategory(draggedTrackSubcategoryId, 'track', track.id, event.clientX > bounds.left + bounds.width / 2).catch(() => undefined);
          return;
        }
        if (draggingSelectedTracks) {
          if (!selectedTrackIds.has(track.id)) createSubcategoryFromSelectedTracks(track).catch(() => undefined);
          return;
        }
        const sourceTrack = detail?.tracks.find((item) => item.id === draggedTrackId);
        if (!sourceTrack || sourceTrack.id === track.id) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const placement = trackDropPlacement(event.clientX, bounds.left, bounds.width);
        if (placement === 'group') {
          if (track.subcategoryId) moveTrackIntoSubcategory(sourceTrack.id, track.subcategoryId).catch(() => undefined);
          else createSubcategoryFromTracks(sourceTrack, track).catch(() => undefined);
          return;
        }
        const beforeTrackId = placement === 'after' ? trackIdAfterTarget(detail?.tracks ?? [], track) : track.id;
        reorderTrack(sourceTrack.id, track.categoryId, beforeTrackId, track.subcategoryId).catch(() => undefined);
      }}
      mobileDragEnabled={reorderMode || (selectionMode && selectedTrackIds.has(track.id))}
      mobileDragSource={mobileTrackDragPreview?.trackId === track.id}
      onMobileDragStart={(point) => beginMobileTrackDrag(track, color, point)}
      onMobileDragMove={moveMobileTrackDrag}
      onMobileDragEnd={finishMobileTrackDrag}
      onDragEnd={() => { cancelScheduledSubcategoryOpen(); setDraggedTrackId(undefined); setDropTrackId(undefined); setDropTrackPlacement(undefined); setDropSubcategoryId(undefined); setDropCategoryId(undefined); }} />;
  }

  function renderActionsContent() {
    if (!detail) return null;
    return <section className="mouse-actions">
      <div className="side-label"><span>Actions de déclenchement</span></div>
      <label><span><i>G</i>Clic gauche</span><select value={detail.project.leftClickAction ?? 'start'} onChange={(event) => updateMouseAction('left', event.target.value as MouseAction)}>{mouseActions.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}</select></label>
      <label><span><i>D</i>Clic droit</span><select value={detail.project.rightClickAction ?? 'crossfade'} onChange={(event) => updateMouseAction('right', event.target.value as MouseAction)}>{mouseActions.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}</select></label>
      <label><span><i>K</i>Clavier</span><select value={detail.project.keyboardAction ?? 'start'} onChange={(event) => updateMouseAction('keyboard', event.target.value as MouseAction)}>{mouseActions.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}</select></label>
    </section>;
  }

  function renderPlayersContent() {
    return <><div className={`side-label player-heading ${playingTracks.length >= maxActivePlaybacks ? 'is-at-limit' : ''}`}><span>En lecture</span><em title={`${playingTracks.length} lecture${playingTracks.length !== 1 ? 's' : ''} sur ${maxActivePlaybacks} maximum`}>{playingTracks.length}/{maxActivePlaybacks}</em>{playingTracks.length > 0 && <button onClick={() => sendOrRun({ type: 'stop-all' })} aria-label="Tout arrêter"><Square size={13} fill="currentColor" /></button>}</div>
      <div className={`now-playing-list ${compactPlayerCards ? 'is-compact' : ''}`}>
        {playingTracks.length === 0 ? <div className="players-empty"><AudioWaveform size={24} /><strong>Aucun son en lecture</strong><span>Les lecteurs actifs apparaîtront ici.</span></div> : playingTracks.map(({ playback, track }) => {
          const category = detail?.categories.find((item) => item.id === track.categoryId);
          const color = track.color ?? category?.color ?? '#71717a';
          return <article className={`player-card ${playback.paused ? 'is-paused' : ''}`} key={playback.id} style={{ '--track-color': color } as React.CSSProperties}>
            <div className="player-card-main"><div className="player-card-copy"><strong>{track.title}</strong><PlaybackOutputSelector title={track.title} outputId={playback.outputId} outputs={routedBridgeOutputs} disabled={playback.fadingOut} onChange={(outputId) => audioEngine.setInstanceOutput(playback.id, outputId).catch((cause) => setError(cause instanceof Error ? cause.message : 'Impossible de changer la sortie audio.'))} /></div>
              <PlaybackPositionControl playback={playback} title={track.title} />
              <PlaybackVolumeControl playback={playback} title={track.title} />
            </div>
            <div className="player-card-controls">
              <button className={playback.loop ? 'active' : ''} disabled={playback.fadingOut} onClick={() => audioEngine.setInstanceLoop(playback.id, !playback.loop)} aria-label={playback.loop ? `Désactiver la boucle de ${track.title}` : `Jouer ${track.title} en boucle`} title="Boucle"><Repeat2 size={15} /></button>
              <button disabled={playback.fadingOut} onClick={() => audioEngine.togglePauseInstance(playback.id)} aria-label={playback.paused ? `Reprendre ${track.title}` : `Mettre ${track.title} en pause`} title={playback.paused ? 'Reprendre' : 'Pause'}>{playback.paused ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}</button>
              <button className="fade-out" disabled={playback.fadingOut} onClick={() => audioEngine.stopInstance(playback.id, track.fadeOutMs > 0 ? track.fadeOutMs : 1_200)} aria-label={`Faire disparaître ${track.title} en fondu`} title="Fondu sortant"><VolumeX size={16} /></button>
              <button className="stop" onClick={() => audioEngine.stopInstance(playback.id, 0)} aria-label={`Arrêter immédiatement cette lecture de ${track.title}`} title="Arrêt immédiat"><Square size={14} fill="currentColor" /></button>
            </div>
          </article>;
        })}
      </div></>;
  }

  function renderPlaylistContent() {
    if (remote) return null;
    if (!playlistsEnabled) return <div className="players-empty plan-feature-unavailable"><LockKeyhole size={24} /><strong>Playlists indisponibles</strong><span>Cette fonctionnalité n’est pas incluse dans votre forfait.</span></div>;
    return <PlaylistPanel items={playlistItems} tracks={detail?.tracks ?? []} colors={detail?.colors ?? []} options={playlistOptions} currentRowIndex={playlistCurrentIndex} maxGroupSize={detail?.project.maxPlaylistGroupSize ?? 4} playbackActive={playlistPlaybacks.length > 0} playbackPaused={playlistPlaybacks.length > 0 && playlistPlaybacks.every((playback) => playback.paused)} saved={Boolean(loadedPlaylistId)} saving={playlistSaving} optionsOpen={playlistOptionsOpen} onOptionsOpenChange={setPlaylistOptionsOpen} onOptionsChange={(patch) => setPlaylistOptions((current) => ({ ...current, ...patch }))} onDropTrack={addTrackToPlaylist} onMoveItem={movePlaylistItem} onRemoveItem={removePlaylistItem} onPlayRow={playPlaylistRow} onPlayPause={playPausePlaylist} onStop={stopPlaylistPlayback} onNext={skipPlaylistRow} onSave={() => saveCurrentPlaylist().catch(() => undefined)} onDelete={() => deleteCurrentPlaylist().catch(() => undefined)} onClear={clearPlaylist} />;
  }

  const storedDockedBlockIds = workspaceDockItems(workspaceLayout);
  const dockedBlockIds = stackedWorkspaceLayout ? ['actions'] as WorkspaceBlockId[] : storedDockedBlockIds;
  const actionsDocked = stackedWorkspaceLayout || workspaceItemIsDocked(workspaceLayout, 'actions');
  const playersDocked = !stackedWorkspaceLayout && workspaceItemIsDocked(workspaceLayout, 'players');
  const playlistDocked = !stackedWorkspaceLayout && workspaceItemIsDocked(workspaceLayout, 'playlist');
  const actionsCollapsed = workspaceItemIsCollapsed(workspaceLayout, 'actions');
  const playlistCollapsed = workspaceItemIsCollapsed(workspaceLayout, 'playlist');

  function swapWorkspacePlacement(sourceId: WorkspaceBlockId, targetId: WorkspaceBlockId) {
    setWorkspaceLayout((current) => {
      const sourceDocked = workspaceItemIsDocked(current, sourceId);
      const targetDocked = workspaceItemIsDocked(current, targetId);
      if (sourceDocked !== targetDocked && (!workspaceDockableBlockIds.includes(sourceId) || !workspaceDockableBlockIds.includes(targetId))) return current;
      return swapWorkspaceItems(current, sourceId, targetId);
    });
  }

  function saveNamedWorkspaceLayout(name: string) {
    if (!workspaceUserId) return;
    const normalizedName = name.trim().slice(0, 60);
    if (!normalizedName) return;
    const snapshot = workspaceLayoutSnapshot(workspaceLayout);
    const existing = savedWorkspaceLayouts.find((item) => item.name.toLocaleLowerCase('fr') === normalizedName.toLocaleLowerCase('fr'))
      ?? savedWorkspaceLayouts.find((item) => workspaceLayoutsMatch(item.layout, snapshot));
    const saved: SavedWorkspaceLayout = { id: existing?.id ?? crypto.randomUUID(), name: normalizedName, layout: snapshot };
    const next = [...savedWorkspaceLayouts.filter((item) => item.id !== existing?.id && item.name.toLocaleLowerCase('fr') !== normalizedName.toLocaleLowerCase('fr') && !workspaceLayoutsMatch(item.layout, snapshot)), saved];
    localStorage.setItem(workspaceSavedLayoutsStorageKey(workspaceUserId), JSON.stringify(next));
    setSavedWorkspaceLayouts(next);
  }

  function loadNamedWorkspaceLayout(id: string) {
    const saved = savedWorkspaceLayouts.find((item) => item.id === id);
    if (saved) setWorkspaceLayout(workspaceLayoutSnapshot(saved.layout));
  }

  function deleteNamedWorkspaceLayout(id: string) {
    if (!workspaceUserId) return;
    const next = savedWorkspaceLayouts.filter((item) => item.id !== id);
    localStorage.setItem(workspaceSavedLayoutsStorageKey(workspaceUserId), JSON.stringify(next));
    setSavedWorkspaceLayouts(next);
  }

  function toggleWorkspaceModule(id: 'actions' | 'playlist') {
    setWorkspaceLayout((current) => setWorkspaceItemCollapsed(current, id, !workspaceItemIsCollapsed(current, id)));
  }

  function expandCollapsedPlaylistOnDrag(event: React.DragEvent<HTMLButtonElement>) {
    if (!playlistsEnabled) return;
    if (!event.dataTransfer.types.includes('application/x-sonoriva-track')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    revealPlaylistModule();
  }

  function dropTrackOnCollapsedPlaylist(event: React.DragEvent<HTMLButtonElement>) {
    if (!playlistsEnabled) return;
    const trackId = event.dataTransfer.getData('application/x-sonoriva-track');
    if (!trackId) return;
    event.preventDefault();
    addTrackToPlaylist(trackId);
  }

  function renderDockedBlock(id: WorkspaceBlockId) {
    return <WorkspaceLayoutBlock key={id} item={workspaceLayoutItem(workspaceLayout, id)} columns={workspaceLayout.columns} label={workspaceBlockLabels[id]} editing={layoutEditing && !remote} docked
      collapsible={id === 'actions' || id === 'playlist'} collapsed={id === 'actions' ? actionsCollapsed : id === 'playlist' ? playlistCollapsed : false}
      moduleIcon={id === 'actions' ? <Radio size={13} /> : id === 'playlist' ? <ListMusic size={13} /> : undefined} moduleBadge={id === 'playlist' ? playlistItems.length : undefined}
      onToggleCollapsed={id === 'actions' || id === 'playlist' ? () => toggleWorkspaceModule(id) : undefined}
      onCollapsedDragOver={id === 'playlist' ? expandCollapsedPlaylistOnDrag : undefined} onCollapsedDrop={id === 'playlist' ? dropTrackOnCollapsedPlaylist : undefined}
      onSwap={swapWorkspacePlacement} onResize={(blockId, width, height) => setWorkspaceLayout((current) => resizeWorkspaceItem(current, blockId, width, height))}>
      {id === 'actions' ? renderActionsContent() : id === 'players' ? renderPlayersContent() : id === 'playlist' ? renderPlaylistContent() : null}
    </WorkspaceLayoutBlock>;
  }

  const activeSavedWorkspaceLayoutId = savedWorkspaceLayouts.find((item) => workspaceLayoutsMatch(item.layout, workspaceLayout))?.id;

  return <div className={`app-shell ${remote ? 'remote-mode' : ''}`}>
    <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
      <header className="brand"><img className="brand-mark small" src="/sonoriva-logo.svg" alt="" /><strong>SonoRiva</strong><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)}><X /></button></header>
      <div className={`sidebar-layout-dock ${layoutEditing ? 'is-editing' : ''}`}
        onDragOver={(event) => { if (!layoutEditing || !event.dataTransfer.types.includes(workspaceBlockMime)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
        onDrop={(event) => { if (!layoutEditing || (event.target instanceof Element && event.target.closest('[data-workspace-block]'))) return; const blockId = event.dataTransfer.getData(workspaceBlockMime) as WorkspaceBlockId; if (!workspaceDockableBlockIds.includes(blockId)) return; event.preventDefault(); setWorkspaceLayout((current) => dockWorkspaceItem(current, blockId)); }}>
        {dockedBlockIds.map(renderDockedBlock)}
        {layoutEditing && <div className="sidebar-dock-drop-hint"><Move size={17} /><strong>Colonne gauche</strong><span>Déposez ici Actions, Lectures ou Playlist</span></div>}
      </div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu" />}

    <main className="workspace">
      {user.isDemo && <aside className="demo-banner" aria-label="Démonstration temporaire"><div><strong>Démo temporaire</strong><span>Vos données sont supprimées après {demoLimits?.lifetimeHours ?? 24} h d’inactivité · {demoLimits?.maxUploads ?? 15} fichiers importés · {formatBytes(demoLimits?.maxFileBytes ?? 5 * 1024 ** 2)} maximum par fichier</span></div><button className="demo-reset" onClick={() => resetDemo().catch((cause) => setError(cause instanceof Error ? cause.message : 'Réinitialisation impossible.'))}><RefreshCcw size={15} />Réinitialiser</button><button className="button demo-login" onClick={() => leaveDemoForLogin().catch((cause) => setError(cause instanceof Error ? cause.message : 'Retour à la connexion impossible.'))}><LogIn size={15} />Se connecter à mon compte</button><button className="button primary" onClick={() => createAccountFromDemo().catch((cause) => setError(cause instanceof Error ? cause.message : 'Création de compte impossible.'))}>Créer mon espace</button></aside>}
      {!remote && (audioOutputUpgradeMode
        ? <AudioOutputUpgradeConsole mode={audioOutputUpgradeMode} onAction={openAudioOutputUpgrade} />
        : <AudioOutputConsole bridgeAvailable={bridgeAvailable} onError={setError} onRoutingChange={updateRoutedBridgeOutputs} />)}
      <header className="topbar">
        <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}><Menu /></button>
        <div className="topbar-title"><p className="eyebrow">{remote ? 'Télécommande' : 'Régie principale'}<span className={`connection-status ${connected ? 'online' : ''}`} role="img" aria-label={connected ? 'Connexion temps réel active' : 'Connexion temps réel interrompue'} title={connected ? 'Connexion temps réel active' : 'Connexion temps réel interrompue'}>{connected ? <Wifi size={14} /> : <WifiOff size={14} />}</span></p><h1>{detail?.project.name ?? 'Chargement…'}</h1></div>
        <div className="topbar-console">
          <section className="console-module next-volume" title="Ce multiplicateur s'applique au prochain son, puis revient à 100 %.">
            <span><Volume2 size={14} />Son suivant</span>
            <div className="next-volume-control"><input type="range" min="0" max="100" value={nextTrackVolume} aria-label="Volume du son suivant" onChange={(event) => { const value = Number(event.target.value); setNextTrackVolume(value); localStorage.setItem('sonoriva-next-volume', String(value)); }} /><strong>{nextTrackVolume} %</strong><button type="button" className={`console-volume-lock ${keepNextTrackVolume ? 'active' : ''}`} role="switch" aria-checked={keepNextTrackVolume} aria-label="Conserver le volume pour les sons suivants" title={keepNextTrackVolume ? 'Volume conservé après chaque lancement' : 'Réinitialiser à 100 % après le prochain lancement'} onClick={() => { const next = !keepNextTrackVolume; setKeepNextTrackVolume(next); localStorage.setItem('sonoriva-keep-next-volume', String(next)); localStorage.setItem('sonoriva-next-volume', String(nextTrackVolume)); }}><i /></button></div>
          </section>
          <section className="console-module stopwatch">
            <span><Timer size={14} />Chrono</span>
            <div><strong>{formatStopwatch(displayedChronoMs)}</strong><button onClick={toggleChrono} aria-label={chronoStartedAt === undefined ? 'Démarrer le chronomètre' : 'Mettre le chronomètre en pause'}>{chronoStartedAt === undefined ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}</button><button onClick={resetChrono} aria-label="Réinitialiser le chronomètre"><RotateCcw size={13} /></button></div>
          </section>
          <section className="console-module wall-clock"><span><Clock3 size={14} />Horloge</span><strong>{formatClock(now)}</strong></section>
        </div>
        <div className="top-actions">
          {!remote && <button className={`icon-button layout-button ${layoutEditing ? 'active' : ''}`} disabled={!customLayoutsEnabled} onClick={() => { setLayoutEditing((current) => !current); setCategoryManageMode(false); setReorderMode(false); setSelectionMode(false); setSelectedTrackIds(new Set()); }} aria-label={layoutEditing ? 'Terminer la modification de la disposition' : 'Modifier la disposition de l’interface'} title={customLayoutsEnabled ? 'Disposition de l’interface' : 'Disposition personnalisée non incluse dans votre forfait'}><LayoutDashboard size={19} /></button>}
          <button className="icon-button support-button" onClick={() => setSupportOpen(true)} aria-label="Ouvrir le support" title="Support"><LifeBuoy size={19} />{supportUnreadCount > 0 && <i aria-label={`${supportUnreadCount} réponse${supportUnreadCount > 1 ? 's' : ''} non lue${supportUnreadCount > 1 ? 's' : ''}`}>{Math.min(supportUnreadCount, 9)}</i>}</button>
          <button className={`icon-button settings-button ${unseenReleases.length > 0 ? 'has-update' : ''}`} onClick={() => { setSettingsInitialSection(undefined); setSettingsOpen(true); }} aria-label="Ouvrir les paramètres" title="Paramètres"><Settings size={19} />{unseenReleases.length > 0 && <i aria-hidden="true" />}</button>
          {!remote && <button className="icon-button reset-show-button" onClick={resetCurrentProject} disabled={!detail} aria-label="Réinitialiser le spectacle en cours" title="Réinitialiser le spectacle"><RefreshCcw size={18} /></button>}
          {!remote && <button className="button primary" onClick={() => setUploadOpen(true)}><Upload size={17} />Ajouter un son</button>}
        </div>
      </header>

      {!remote && layoutEditing && <WorkspaceLayoutToolbar preset={workspaceLayout.preset} savedLayouts={savedWorkspaceLayouts} activeSavedLayoutId={activeSavedWorkspaceLayoutId}
        onPresetChange={(preset) => setWorkspaceLayout(createWorkspaceLayout(preset))}
        onSavedLayoutChange={loadNamedWorkspaceLayout}
        onSave={saveNamedWorkspaceLayout}
        onDeleteSaved={deleteNamedWorkspaceLayout}
        onReset={() => setWorkspaceLayout(createWorkspaceLayout('classic'))}
        onClose={() => setLayoutEditing(false)} />}
      <div className={`workspace-layout-grid ${layoutEditing ? 'is-editing' : ''}`} style={{ '--workspace-columns': workspaceLayout.columns } as React.CSSProperties}
        onDragOver={(event) => { if (!layoutEditing || !event.dataTransfer.types.includes(workspaceBlockMime)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
        onDrop={(event) => {
          if (!layoutEditing || (event.target instanceof Element && event.target.closest('[data-workspace-block]'))) return;
          const blockId = event.dataTransfer.getData(workspaceBlockMime) as WorkspaceBlockId;
          if (!workspaceBlockLabels[blockId]) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          const styles = window.getComputedStyle(event.currentTarget);
          const columnGap = Number.parseFloat(styles.columnGap) || 0;
          const rowGap = Number.parseFloat(styles.rowGap) || 0;
          const columnWidth = (bounds.width - columnGap * (workspaceLayout.columns - 1)) / workspaceLayout.columns;
          const rowHeight = (bounds.height - rowGap * 11) / 12;
          const x = Math.floor((event.clientX - bounds.left) / (columnWidth + columnGap));
          const y = Math.floor((event.clientY - bounds.top) / (rowHeight + rowGap));
          setWorkspaceLayout((current) => workspaceItemIsDocked(current, blockId) ? placeWorkspaceItemOnGrid(current, blockId, x, y) : moveWorkspaceItem(current, blockId, x, y));
        }}>
        {!actionsDocked && <WorkspaceLayoutBlock item={workspaceLayoutItem(workspaceLayout, 'actions')} columns={workspaceLayout.columns} label={workspaceBlockLabels.actions} editing={layoutEditing && !remote} collapsible collapsed={actionsCollapsed} moduleIcon={<Radio size={13} />} onToggleCollapsed={() => toggleWorkspaceModule('actions')}
          onSwap={swapWorkspacePlacement}
          onResize={(id, width, height) => setWorkspaceLayout((current) => resizeWorkspaceItem(current, id, width, height))}>{renderActionsContent()}</WorkspaceLayoutBlock>}

        {!playersDocked && <WorkspaceLayoutBlock item={workspaceLayoutItem(workspaceLayout, 'players')} columns={workspaceLayout.columns} label={workspaceBlockLabels.players} editing={layoutEditing && !remote}
          onSwap={swapWorkspacePlacement}
          onResize={(id, width, height) => setWorkspaceLayout((current) => resizeWorkspaceItem(current, id, width, height))}>
          {renderPlayersContent()}
        </WorkspaceLayoutBlock>}

        {!playlistDocked && <WorkspaceLayoutBlock item={workspaceLayoutItem(workspaceLayout, 'playlist')} columns={workspaceLayout.columns} label={workspaceBlockLabels.playlist} editing={layoutEditing && !remote}
          collapsible collapsed={playlistCollapsed} moduleIcon={<ListMusic size={13} />} moduleBadge={playlistItems.length} onToggleCollapsed={() => toggleWorkspaceModule('playlist')} onCollapsedDragOver={expandCollapsedPlaylistOnDrag} onCollapsedDrop={dropTrackOnCollapsedPlaylist}
          onSwap={swapWorkspacePlacement}
          onResize={(id, width, height) => setWorkspaceLayout((current) => resizeWorkspaceItem(current, id, width, height))}>
          {renderPlaylistContent()}
        </WorkspaceLayoutBlock>}

        <WorkspaceLayoutBlock item={workspaceLayoutItem(workspaceLayout, 'categories')} columns={workspaceLayout.columns} label={workspaceBlockLabels.categories} editing={layoutEditing && !remote}
          onSwap={swapWorkspacePlacement}
          onResize={(id, width, height) => setWorkspaceLayout((current) => resizeWorkspaceItem(current, id, width, height))}>
      {detail && <section className="category-strip">
        <div className="category-strip-heading"><span>{categoryManageMode ? 'Glissez les catégories pour les réordonner' : 'Catégories'}</span><div><button className={`icon-button subtle category-manage-toggle ${categoryManageMode ? 'active' : ''}`} onClick={() => { setCategoryManageMode((current) => !current); setReorderMode(false); setSelectionMode(false); setSelectedTrackIds(new Set()); setDraggedCategoryId(undefined); setDropCategoryOrderId(undefined); setDropCategoryAfter(false); }} aria-label={categoryManageMode ? 'Terminer la gestion des catégories' : 'Gérer les catégories'} title={categoryManageMode ? 'Terminer' : 'Réordonner ou supprimer'}><ArrowUpDown size={16} /></button><button className="icon-button subtle" onClick={createCategory} aria-label="Nouvelle catégorie"><Plus size={17} /></button></div></div>
        <div className="category-tabs-row" style={{ '--category-tab-width': `${categoryWidth}px` } as React.CSSProperties}>
          <nav className="category-tabs" aria-label="Catégories de sons" onDragOver={(event) => { if (!categoryManageMode || !draggedCategoryId) return; event.preventDefault(); }} onDrop={(event) => { if (!categoryManageMode || !draggedCategoryId || event.target !== event.currentTarget) return; event.preventDefault(); reorderCategories(draggedCategoryId).catch(() => undefined); }}>
            <button className={`category-tab category-tab-all ${selectedCategoryId === 'all' || isSearching ? 'active' : ''}`} onClick={() => selectCategory('all')} style={{ '--category-color': '#a1a1aa', '--category-contrast': contrastColor('#a1a1aa') } as React.CSSProperties}><span>Tous les sons</span><em className="category-tab-count">{detail.tracks.length}</em></button>
            {displayedCategories.map((category) => <div key={category.id} className={`category-tab-shell ${categoryManageMode ? 'is-managing' : ''} ${dropCategoryOrderId === category.id ? `is-order-target ${dropCategoryAfter ? 'drop-after' : 'drop-before'}` : ''}`} style={{ '--category-color': category.color, '--category-contrast': contrastColor(category.color) } as React.CSSProperties} draggable={categoryManageMode}
              onDragStart={(event) => { if (!categoryManageMode) return; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', category.id); setDraggedCategoryId(category.id); }}
              onDragOver={(event) => { if (!categoryManageMode || !draggedCategoryId || draggedCategoryId === category.id) return; event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); setDropCategoryOrderId(category.id); setDropCategoryAfter(event.clientX > bounds.left + bounds.width / 2); }}
              onDragLeave={() => setDropCategoryOrderId((current) => current === category.id ? undefined : current)}
              onDrop={(event) => { if (!categoryManageMode || !draggedCategoryId) return; event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); reorderCategories(draggedCategoryId, category.id, event.clientX > bounds.left + bounds.width / 2).catch(() => undefined); }}
              onDragEnd={() => { setDraggedCategoryId(undefined); setDropCategoryOrderId(undefined); setDropCategoryAfter(false); }}>
              <button className={`category-tab ${!isSearching && category.id === selectedCategoryId ? 'active' : ''} ${dropCategoryId === category.id ? 'is-drop-target' : ''}`} data-category-id={category.id} onClick={() => selectCategory(category.id)}
                onDragOver={(event) => { if ((!reorderMode && !draggingSelectedTracks) || (!draggedTrackId && !draggedPlaylistId && !draggedTrackSubcategoryId)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropCategoryId(category.id); setDropTrackId(undefined); setDropPlaylistId(undefined); setDropPlaylistTrackId(undefined); setDropSubcategoryPositionId(undefined); }}
                onDragLeave={() => setDropCategoryId((current) => current === category.id ? undefined : current)}
                onDrop={(event) => { if ((!reorderMode && !draggingSelectedTracks) || (!draggedTrackId && !draggedPlaylistId && !draggedTrackSubcategoryId)) return; event.preventDefault(); event.stopPropagation(); if (draggingSelectedTracks) moveSelectedTracks(category.id, null).catch(() => undefined); else if (draggedPlaylistId) movePlaylistToCategory(draggedPlaylistId, category.id).catch(() => undefined); else if (draggedTrackSubcategoryId) moveSubcategoryToCategory(draggedTrackSubcategoryId, category.id).catch(() => undefined); else if (draggedTrackId) reorderTrack(draggedTrackId, category.id).catch(() => undefined); }}>
                <span>{category.name}</span><em className="category-tab-count">{detail.tracks.filter((track) => track.categoryId === category.id).length}</em>
              </button>
              {categoryManageMode && <><GripVertical className="category-order-handle" size={15} aria-hidden="true" /><button className="category-delete" onClick={(event) => { event.stopPropagation(); deleteCategory(category).catch(() => undefined); }} aria-label={`Supprimer la catégorie ${category.name}`} title="Supprimer"><Trash2 size={14} /></button></>}
            </div>)}
          </nav>
          <button className="category-resizer" aria-label="Régler la largeur des catégories" title="Glisser pour régler la largeur · Double-cliquer pour réinitialiser"
            onDoubleClick={() => { setCategoryWidth(112); localStorage.setItem('sonoriva-category-width', '112'); }}
            onPointerDown={(event) => { categoryResize.current = { x: event.clientX, width: categoryWidth, latest: categoryWidth }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={(event) => { if (!categoryResize.current) return; const next = Math.min(220, Math.max(82, categoryResize.current.width + event.clientX - categoryResize.current.x)); categoryResize.current.latest = next; setCategoryWidth(next); }}
            onPointerUp={(event) => { if (!categoryResize.current) return; event.currentTarget.releasePointerCapture(event.pointerId); localStorage.setItem('sonoriva-category-width', String(categoryResize.current.latest)); categoryResize.current = undefined; }}>
            <GripVertical size={17} />
          </button>
        </div>
      </section>}
        </WorkspaceLayoutBlock>

        <WorkspaceLayoutBlock item={workspaceLayoutItem(workspaceLayout, 'soundboard')} columns={workspaceLayout.columns} label={workspaceBlockLabels.soundboard} editing={layoutEditing && !remote}
          onSwap={swapWorkspacePlacement}
          onResize={(id, width, height) => setWorkspaceLayout((current) => resizeWorkspaceItem(current, id, width, height))}>

      <section className="dashboard" aria-label="Tableau de bord des morceaux">
        <div className="search"><div className="search-scope" role="group" aria-label="Filtres de recherche cumulables"><button type="button" className={searchScopes.has('name') ? 'active' : ''} aria-pressed={searchScopes.has('name')} onClick={() => toggleSearchScope('name')}>Noms</button><button type="button" className={searchScopes.has('tags') ? 'active' : ''} aria-pressed={searchScopes.has('tags')} onClick={() => toggleSearchScope('tags')}>Tags</button><button type="button" className={searchScopes.has('subcategories') ? 'active' : ''} aria-pressed={searchScopes.has('subcategories')} onClick={() => toggleSearchScope('subcategories')}>SC</button></div><Search size={18} /><input ref={searchInputRef} aria-label="Rechercher dans les filtres actifs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher…" /><span className="search-end-actions">{isSearching && <button type="button" className="search-clear" onClick={() => { setSearch(''); searchInputRef.current?.focus(); }} aria-label="Annuler la recherche" title="Effacer la recherche"><X size={16} /></button>}{!remote && <button type="button" className="search-openverse" onClick={() => { setOpenverseAutoSearch(true); setOpenverseOpen(true); }} aria-label={search.trim() ? `Rechercher « ${search.trim()} » sur Openverse` : 'Ouvrir la recherche Openverse'} title={search.trim() ? `Rechercher « ${search.trim()} » sur Openverse` : 'Rechercher sur Openverse'}><Waves size={17} /></button>}<kbd>{formatShortcut(projectShortcut(detail?.project ?? {}, 'searchShortcut'))}</kbd></span></div>
        <div className="dashboard-actions">
          {!remote && <button className={`dashboard-button ${preloadedInCategory === tracksToPreload.length && tracksToPreload.length ? 'is-loaded' : ''}`} onClick={() => preloadCategory()} disabled={!tracksToPreload.length || Boolean(preloadProgress) || preloadedInCategory === tracksToPreload.length}
            aria-label={preloadProgress ? `Mise hors ligne ${preloadProgress.done} sur ${preloadProgress.total}` : preloadedInCategory === tracksToPreload.length && tracksToPreload.length ? 'Catégorie disponible hors ligne' : 'Rendre la catégorie disponible hors ligne'} title={preloadProgress ? `${preloadProgress.done}/${preloadProgress.total}` : preloadedInCategory === tracksToPreload.length && tracksToPreload.length ? 'Disponible hors ligne' : 'Rendre la catégorie disponible hors ligne'}>
            {preloadProgress ? <LoaderCircle className="spin" size={18} /> : preloadedInCategory === tracksToPreload.length && tracksToPreload.length ? <CircleCheck size={18} /> : <Download size={18} />}
          </button>}
          {!remote && <button className={`dashboard-button selection-mode-button ${selectionMode ? 'active' : ''}`} onClick={toggleSelectionMode} aria-label={selectionMode ? 'Terminer la sélection multiple' : 'Sélectionner plusieurs morceaux'} title={selectionMode ? 'Terminer la sélection' : 'Sélection multiple'}><Scan size={18} />{selectedTrackIds.size > 0 && <em>{selectedTrackIds.size}</em>}</button>}
          {!remote && <button className={`dashboard-button ${reorderMode ? 'active' : ''}`} onClick={() => { setReorderMode((current) => !current); setSelectionMode(false); setSelectedTrackIds(new Set()); setCategoryManageMode(false); setDraggedTrackId(undefined); setDraggedTrackSubcategoryId(undefined); setDropTrackId(undefined); setDropTrackPlacement(undefined); setDropSubcategoryId(undefined); setDropSubcategoryPositionId(undefined); setDropCategoryId(undefined); setDraggedPlaylistId(undefined); setDropPlaylistId(undefined); setDropPlaylistTrackId(undefined); setDropPlaylistAfter(false); }} disabled={reordering}
            aria-label={reordering ? 'Enregistrement de la réorganisation' : reorderMode ? 'Terminer la réorganisation' : 'Réorganiser les morceaux'} title={reorderMode ? 'Terminer la réorganisation' : 'Réorganiser les morceaux'}><span className="reorder-mode-icon" aria-hidden="true"><SquareDashed size={20} /><Move size={12} /></span></button>}
          <div className="dashboard-control">
            <button className={`dashboard-button ${columnsOpen ? 'active' : ''}`} onClick={() => { setColumnsOpen((current) => !current); setHistoryOpen(false); }} aria-label="Régler l’affichage du soundboard" title="Affichage du soundboard"><Columns3 size={18} /></button>
            {columnsOpen && <div className="dashboard-popover columns-popover">
              {soundboardCategoryScopeAvailable && <div className="soundboard-view-scope"><span>Appliquer à</span><div role="group" aria-label="Portée du mode d’affichage"><button type="button" className={effectiveSoundboardViewScope === 'category' ? 'active' : ''} aria-pressed={effectiveSoundboardViewScope === 'category'} onClick={() => setSoundboardViewScope('category')}>Cette catégorie</button><button type="button" className={effectiveSoundboardViewScope === 'all' ? 'active' : ''} aria-pressed={effectiveSoundboardViewScope === 'all'} onClick={applySoundboardViewToAll}>Toutes</button></div></div>}
              <label><span>Affichage</span><select value={soundboardViewMode} onChange={(event) => updateSoundboardViewMode(event.target.value as SoundboardViewMode)}><option value="cards">Cartes</option><option value="list">Liste</option><option value="auto">Automatique</option></select></label>
              {soundboardViewMode === 'auto' && <label><span>Liste à partir de</span><strong>{soundboardViewSettings.automaticListThreshold} morceaux</strong><input type="range" min="5" max="200" value={soundboardViewSettings.automaticListThreshold} onChange={(event) => updateSoundboardViewSettings({ automaticListThreshold: Number(event.target.value) })} /></label>}
              <label><span>{soundboardView === 'list' ? 'Colonnes de liste' : 'Colonnes de cartes'}</span><strong>{trackColumns}</strong><input type="range" min={soundboardView === 'list' ? 1 : compactLayout ? 1 : 2} max={soundboardView === 'list' ? compactLayout ? 2 : 4 : compactLayout ? 3 : 12} value={trackColumns} onChange={(event) => updateTrackColumns(Number(event.target.value))} /></label>
              {soundboardViewMode === 'auto' && <small>Affichage actuel : {soundboardView === 'list' ? 'liste' : 'cartes'}</small>}
            </div>}
          </div>
          {!remote && <div className="dashboard-control">
            <button className={`dashboard-button ${historyOpen ? 'active' : ''}`} onClick={() => { setHistoryOpen((current) => !current); setColumnsOpen(false); }} aria-label="Réinitialiser les progressions" title="Réinitialiser les progressions"><History size={18} /></button>
            {historyOpen && <div className="dashboard-popover history-popover">
              <button onClick={() => resetPlaybackProgress('category')} disabled={!currentCategory || isSearching}><RotateCcw size={15} /><span><strong>Catégorie actuelle</strong><small>{currentCategory && !isSearching ? currentCategory.name : 'Sélectionnez une catégorie'}</small></span></button>
              <button onClick={() => resetPlaybackProgress('project')}><RotateCcw size={15} /><span><strong>Tout le spectacle</strong><small>{detail?.tracks.length ?? 0} morceaux</small></span></button>
            </div>}
          </div>}
          {!remote && <button className="dashboard-button playlist-add-category" onClick={addCategoryToPlaylist} disabled={!playlistsEnabled || !tracksToPreload.length}
            aria-label={currentCategory ? `Ajouter les ${tracksToPreload.length} morceaux de ${currentCategory.name} à la playlist` : `Ajouter les ${tracksToPreload.length} morceaux à la playlist`}
            title={!playlistsEnabled ? 'Playlists non incluses dans votre forfait' : currentCategory ? `Ajouter toute la catégorie « ${currentCategory.name} » à la playlist` : 'Ajouter tous les morceaux à la playlist'}><ListPlus size={19} /></button>}
          {!remote && !isSearching && <button className="dashboard-button" onClick={() => setSubcategoryDialog('new')} aria-label="Créer une sous-catégorie" title="Nouvelle sous-catégorie"><FolderPlus size={19} /></button>}
          <div className="track-count"><span>{isSearching ? visibleBoardItems.length : categoryTracks.length}</span><small>{isSearching ? 'rés.' : `son${categoryTracks.length !== 1 ? 's' : ''}`}</small></div>
        </div>
      </section>

      {selectionMode && <section className="selection-toolbar" aria-label="Outils de sélection multiple">
        <div><Scan size={18} /><span><strong>{selectedTrackIds.size ? `${selectedTrackIds.size} morceau${selectedTrackIds.size !== 1 ? 'x' : ''} sélectionné${selectedTrackIds.size !== 1 ? 's' : ''}` : 'Sélection multiple'}</strong><small>Sélectionnez les cartes, puis glissez l’une d’elles vers une catégorie ou une sous-catégorie.</small></span></div>
        <span className="selection-toolbar-actions"><button className="button ghost" onClick={() => setSelectedTrackIds(new Set(visibleTracks.map((track) => track.id)))} disabled={!visibleTracks.length}>Tout sélectionner</button><button className="button ghost" onClick={() => setSelectedTrackIds(new Set())} disabled={!selectedTrackIds.size}>Effacer</button><button className="button ghost batch-move-button" onClick={() => setBatchMoveOpen(true)} disabled={!selectedTrackIds.size}><FolderInput size={16} />Déplacer{selectedTrackIds.size ? ` (${selectedTrackIds.size})` : ''}</button><button className="button primary" onClick={() => setBatchEditOpen(true)} disabled={!selectedTrackIds.size}><SlidersHorizontal size={16} />Modifier{selectedTrackIds.size ? ` (${selectedTrackIds.size})` : ''}</button></span>
      </section>}

      <section className="soundboard">
        {remote && <div className="remote-banner"><Radio size={18} /><span>Mode télécommande — les sons seront joués sur la régie connectée.</span></div>}
        {!detail ? <div className="empty-state"><div className="skeleton-grid" /></div> : visibleBoardItems.length === 0 ? <div className="empty-state"><span className="empty-icon"><AudioLines /></span><h2>{search ? 'Aucun résultat trouvé' : 'Votre scène attend son premier son'}</h2><p>{search ? 'Essayez une autre recherche ou activez un autre filtre.' : 'Importez une musique ou un bruitage pour commencer votre soundboard.'}</p>{!remote && !search && <button className="button primary" onClick={() => setUploadOpen(true)}><Upload size={17} />Importer un son</button>}</div> : <div className={`track-grid ${soundboardView === 'list' ? 'is-list' : ''} ${selectionMode ? 'selection-mode' : ''} ${draggingSelectedTracks ? 'dragging-selection' : ''}`} style={{ '--track-columns': trackColumns } as React.CSSProperties} onPointerDown={beginMarqueeSelection} onPointerMove={moveMarqueeSelection} onPointerUp={endMarqueeSelection} onPointerCancel={endMarqueeSelection}>
          {visibleBoardItems.map((boardItem, boardIndex) => {
            let tile: React.ReactNode;
            if (boardItem.kind === 'playlist') {
              const playlist = boardItem.playlist;
              tile = <PlaylistPad playlist={playlist} reorderEnabled={reorderMode} selectionDisabled={selectionMode} dropTarget={dropPlaylistId === playlist.id} dropAfter={dropPlaylistAfter} onLoad={() => loadPlaylist(playlist)}
                onDragStart={(event) => { if (!reorderMode) return; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-sonoriva-playlist', playlist.id); setDraggedPlaylistId(playlist.id); }}
                onDragOver={(event) => { if (!reorderMode || (!draggedPlaylistId && !draggedTrackSubcategoryId) || draggedPlaylistId === playlist.id) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const bounds = event.currentTarget.getBoundingClientRect(); setDropPlaylistId(playlist.id); setDropPlaylistTrackId(undefined); setDropSubcategoryPositionId(undefined); setDropPlaylistAfter(event.clientX > bounds.left + bounds.width / 2); }}
                onDrop={(event) => { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); if (draggedPlaylistId && draggedPlaylistId !== playlist.id) reorderPlaylist(draggedPlaylistId, 'playlist', playlist.id, event.clientX > bounds.left + bounds.width / 2).catch(() => undefined); else if (draggedTrackSubcategoryId) reorderSubcategory(draggedTrackSubcategoryId, 'playlist', playlist.id, event.clientX > bounds.left + bounds.width / 2).catch(() => undefined); }}
                onDragEnd={() => { setDraggedPlaylistId(undefined); setDropPlaylistId(undefined); setDropPlaylistTrackId(undefined); setDropSubcategoryPositionId(undefined); setDropCategoryId(undefined); setDropPlaylistAfter(false); }} />;
            } else if (boardItem.kind === 'subcategory') {
              const subcategory = boardItem.subcategory;
              const memberTracks = detail.tracks.filter((track) => track.subcategoryId === subcategory.id).sort((first, second) => first.position - second.position);
              tile = <TrackSubcategoryPad subcategory={subcategory} tracks={memberTracks} open={openSubcategoryId === subcategory.id} reorderEnabled={reorderMode} dropTarget={dropSubcategoryId === subcategory.id} positionTarget={dropSubcategoryPositionId === subcategory.id ? (dropPlaylistAfter ? 'after' : 'before') : undefined}
                onToggle={() => setOpenSubcategoryId((current) => current === subcategory.id ? undefined : subcategory.id)}
                onEdit={() => setSubcategoryDialog(subcategory)}
                onDragStart={(event) => { if (!reorderMode) return; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-sonoriva-track-subcategory', subcategory.id); setDraggedTrackSubcategoryId(subcategory.id); }}
                onDragOver={(event) => { if (!reorderMode && !draggingSelectedTracks) return; if (draggedTrackId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; scheduleSubcategoryOpen(subcategory.id); setDropSubcategoryId(subcategory.id); setDropSubcategoryPositionId(undefined); setDropTrackId(undefined); setDropTrackPlacement(undefined); return; } if ((draggedTrackSubcategoryId && draggedTrackSubcategoryId !== subcategory.id) || draggedPlaylistId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; const bounds = event.currentTarget.getBoundingClientRect(); setDropSubcategoryPositionId(subcategory.id); setDropSubcategoryId(undefined); setDropPlaylistId(undefined); setDropPlaylistTrackId(undefined); setDropPlaylistAfter(event.clientX > bounds.left + bounds.width / 2); } }}
                onDragLeave={(event) => { const nextTarget = event.relatedTarget as Node | null; if (nextTarget && event.currentTarget.contains(nextTarget)) return; cancelScheduledSubcategoryOpen(subcategory.id); }}
                onDrop={(event) => { event.preventDefault(); cancelScheduledSubcategoryOpen(subcategory.id); if (draggingSelectedTracks) { moveSelectedTracks(subcategory.categoryId, subcategory.id).catch(() => undefined); return; } if (draggedTrackId) { moveTrackIntoSubcategory(draggedTrackId, subcategory.id).catch(() => undefined); return; } const bounds = event.currentTarget.getBoundingClientRect(); const after = event.clientX > bounds.left + bounds.width / 2; if (draggedTrackSubcategoryId && draggedTrackSubcategoryId !== subcategory.id) reorderSubcategory(draggedTrackSubcategoryId, 'subcategory', subcategory.id, after).catch(() => undefined); else if (draggedPlaylistId) reorderPlaylist(draggedPlaylistId, 'subcategory', subcategory.id, after).catch(() => undefined); }}
                onDragEnd={() => { cancelScheduledSubcategoryOpen(); setDraggedTrackSubcategoryId(undefined); setDropSubcategoryId(undefined); setDropSubcategoryPositionId(undefined); setDropPlaylistId(undefined); setDropPlaylistTrackId(undefined); setDropCategoryId(undefined); setDropPlaylistAfter(false); }} />;
            } else {
              tile = renderBoardTrack(boardItem.track);
            }
            const openBoardIndex = visibleBoardItems.findIndex((item) => item.kind === 'subcategory' && item.id === openSubcategoryId);
            const rowStart = Math.floor(boardIndex / trackColumns) * trackColumns;
            const rowEndsHere = boardIndex % trackColumns === trackColumns - 1 || boardIndex === visibleBoardItems.length - 1;
            const showDrawer = rowEndsHere && openBoardIndex >= rowStart && openBoardIndex <= boardIndex;
            const subcategoryColumn = openBoardIndex % trackColumns;
            const boardGap = compactLayout || appSkin === 'studio' ? 8 : 10;
            const drawerBorderCompensation = 4 / trackColumns;
            const joinLeft = `calc(${subcategoryColumn * 100 / trackColumns}% + ${subcategoryColumn * boardGap / trackColumns + subcategoryColumn * drawerBorderCompensation}px)`;
            const joinWidth = `calc(${100 / trackColumns}% - ${(trackColumns - 1) * boardGap / trackColumns}px + ${drawerBorderCompensation}px)`;
            const drawerEdgeClasses = subcategoryDrawerEdgeClasses(subcategoryColumn, trackColumns);
            return <Fragment key={`${boardItem.kind}:${boardItem.id}`}>{tile}{showDrawer && openSubcategory && <section className={`subcategory-drawer ${drawerEdgeClasses} ${dropSubcategoryId === openSubcategory.id ? 'is-track-drop-target' : ''}`} data-subcategory-drawer-id={openSubcategory.id} style={{ '--subcategory-color': openSubcategory.color, '--subcategory-join-left': joinLeft, '--subcategory-join-width': joinWidth } as React.CSSProperties}
              onDragOver={(event) => { const overTrack = event.target instanceof Element && Boolean(event.target.closest('[data-track-id]')); if (!canDropTrackInSubcategoryDrawer(reorderMode || draggingSelectedTracks, draggedTrackId, overTrack)) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; setDropSubcategoryId(openSubcategory.id); setDropTrackId(undefined); setDropTrackPlacement(undefined); }}
              onDragLeave={(event) => { const nextTarget = event.relatedTarget as Node | null; if (nextTarget && event.currentTarget.contains(nextTarget)) return; setDropSubcategoryId((current) => current === openSubcategory.id ? undefined : current); }}
              onDrop={(event) => { const overTrack = event.target instanceof Element && Boolean(event.target.closest('[data-track-id]')); if (!canDropTrackInSubcategoryDrawer(reorderMode || draggingSelectedTracks, draggedTrackId, overTrack) || !draggedTrackId) return; event.preventDefault(); event.stopPropagation(); if (draggingSelectedTracks) moveSelectedTracks(openSubcategory.categoryId, openSubcategory.id).catch(() => undefined); else moveTrackIntoSubcategory(draggedTrackId, openSubcategory.id).catch(() => undefined); }}>
              <span className="subcategory-drawer-join" aria-hidden="true" />
              <header><span className="subcategory-drawer-actions"><button type="button" className="icon-button" onClick={() => setSubcategoryDialog(openSubcategory)} aria-label={`Modifier ${openSubcategory.name}`} title="Modifier"><Pencil size={15} /></button><button type="button" className="icon-button danger" onClick={() => { if (window.confirm(`Supprimer la sous-catégorie « ${openSubcategory.name} » ? Les morceaux resteront dans sa catégorie parente.`)) deleteSubcategory(openSubcategory).catch((cause) => setError(cause instanceof Error ? cause.message : 'Suppression impossible.')); }} aria-label={`Supprimer ${openSubcategory.name}`} title="Supprimer"><Trash2 size={15} /></button><button type="button" className="icon-button" onClick={() => { setEditingSubcategoryName(false); setOpenSubcategoryId(undefined); }} aria-label="Fermer la sous-catégorie"><X size={16} /></button></span><span className="subcategory-drawer-heading"><em>{openSubcategoryTracks.length}</em>{editingSubcategoryName ? <input className="subcategory-inline-name" value={subcategoryNameDraft} maxLength={80} autoFocus aria-label="Nom de la sous-catégorie" onChange={(event) => setSubcategoryNameDraft(event.target.value)} onBlur={() => renameSubcategory(openSubcategory, subcategoryNameDraft).catch(() => undefined)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === 'Escape') { event.preventDefault(); setSubcategoryNameDraft(openSubcategory.name); setEditingSubcategoryName(false); } }} /> : <button type="button" className="subcategory-inline-title" onClick={() => { setSubcategoryNameDraft(openSubcategory.name); setEditingSubcategoryName(true); }} title="Cliquer pour renommer"><strong>{openSubcategory.name}</strong></button>}</span></header>
              {openSubcategoryTracks.length > 0 ? <div className={`subcategory-drawer-grid ${soundboardView === 'list' ? 'is-list' : ''}`}>{openSubcategoryTracks.map((track) => renderBoardTrack(track))}</div> : <div className="subcategory-drawer-empty"><FolderPlus size={22} /><span>Glissez des morceaux dans le tiroir pour les ajouter.</span></div>}
            </section>}</Fragment>;
          })}
        </div>}
      </section>
        </WorkspaceLayoutBlock>
      </div>

      <footer className="statusbar"><span><i className={connected ? 'live' : ''} />{remote ? 'Contrôleur' : 'Lecteur principal'} · volume maître {masterVolume} %{shortcutOutputSecondary ? ' · sortie secondaire' : ''}</span><span><Settings2 size={14} /> SonoRiva {releaseInfo?.currentVersion ?? __APP_VERSION__} · {audioEngine.getPlaybackMode() === 'bridge' ? 'Bridge audio' : 'Web Audio'} · {activePlaybacks.length} actif{activePlaybacks.length !== 1 ? 's' : ''}</span></footer>
    </main>

    {mobileTrackDragPreview && <div className="mobile-track-drag-preview" aria-hidden="true" style={{ '--track-color': mobileTrackDragPreview.color, left: mobileTrackDragPreview.clientX, top: mobileTrackDragPreview.clientY } as React.CSSProperties}><span>{mobileTrackDragPreview.title}</span>{mobileTrackDragPreview.count > 1 && <strong>{mobileTrackDragPreview.count}</strong>}</div>}

    {uploadOpen && detail && <UploadDialog projectId={detail.project.id} categories={detail.categories} onClose={() => setUploadOpen(false)} onUploaded={async () => { setUploadOpen(false); await refreshProject(); }} />}
    {settingsOpen && <SettingsDialog user={user} projects={projects} projectColors={detail?.project.id === selectedProjectId ? detail.colors : []} selectedProjectId={selectedProjectId} initialSection={settingsInitialSection} offlineStatus={offlineStatus} remote={remote} appVersion={releaseInfo?.currentVersion ?? __APP_VERSION__} hasUnseenReleases={unseenReleases.length > 0} automaticUpdates={automaticUpdates} openSubcategoriesOnDrag={openSubcategoriesOnDrag} appSkin={appSkin} supportUnreadCount={supportUnreadCount} onAutomaticUpdatesChange={setAutomaticUpdatePreference} onOpenSubcategoriesOnDragChange={setOpenSubcategoriesOnDragPreference} onAppSkinChange={changeAppSkin} onAccountChange={handleAccountChange} onClose={() => { setSettingsOpen(false); setSettingsInitialSection(undefined); }} onChooseProject={chooseProject} onCreateProject={createProject} onReorderProjects={reorderProjects} onDeleteProject={deleteProject} onCreateProjectColor={createProjectColor} onDeleteProjectColor={deleteProjectColor} onReorderProjectColors={reorderProjectColors} onImportSoundShow={() => { setSettingsOpen(false); setSoundShowImportOpen(true); }} onOpenOpenverse={() => { setSettingsOpen(false); setOpenverseAutoSearch(false); setOpenverseOpen(true); }} onOpenWhatsNew={() => { setSettingsOpen(false); setWhatsNewOpen(true); }} onOpenSupport={() => { setSettingsOpen(false); setSupportOpen(true); }} onToggleRemote={toggleRemoteMode} onCacheOffline={cacheOffline} onUpdateKeyAction={updateKeyAction} onUpdateKeyboardShortcut={updateKeyboardShortcut} onUpdatePlaylistGroupLimit={updatePlaylistGroupLimit} onUpdatePlaybackSettings={updatePlaybackSettings} onLogin={() => { setSettingsOpen(false); leaveDemoForLogin().catch((cause) => setError(cause instanceof Error ? cause.message : 'Retour à la connexion impossible.')); }} onLogout={() => { setSettingsOpen(false); logout().catch((cause) => setError(cause instanceof Error ? cause.message : 'Déconnexion impossible.')); }} />}
    {supportOpen && <SupportDialog onClose={() => setSupportOpen(false)} onUnreadChange={setSupportUnreadCount} />}
    {whatsNewOpen && releaseInfo && <WhatsNewDialog releases={releasesForDialog} currentVersion={releaseInfo.currentVersion} onClose={closeWhatsNew} />}
    {soundShowImportOpen && <SoundShowImportDialog onClose={() => setSoundShowImportOpen(false)} onImported={async (projectId) => { setSoundShowImportOpen(false); await loadProjects(); chooseProject(projectId); }} />}
    {openverseOpen && detail && <OpenverseDialog initialQuery={search} autoSearch={openverseAutoSearch} projectId={detail.project.id} categories={detail.categories} subcategories={detail.subcategories} projectColors={detail.colors} defaultCategoryId={selectedCategoryId !== 'all' ? selectedCategoryId : undefined} nextPosition={detail.tracks.length} bridgeOutputs={routedBridgeOutputs} mainBridgeOutputId={mainBridgeOutputId} onImported={refreshProject} onClose={() => { setOpenverseOpen(false); setOpenverseAutoSearch(false); }} />}
    {editingTrack && detail && <TrackDialog track={editingTrack} categories={detail.categories} projectColors={detail.colors} onAddProjectColor={createProjectColor} onClose={() => setEditingTrack(undefined)} onChanged={async () => { setEditingTrack(undefined); await refreshProject(); }} />}
    {subcategoryDialog && detail && <TrackSubcategoryDialog subcategory={subcategoryDialog === 'new' ? undefined : subcategoryDialog} categories={detail.categories} colors={detail.colors} defaultCategoryId={selectedCategoryId === 'all' ? null : selectedCategoryId} defaultColor={currentCategory?.color ?? detail.colors[0]?.color ?? '#8b5cf6'} onClose={() => setSubcategoryDialog(undefined)} onSave={saveSubcategory} onDelete={() => subcategoryDialog === 'new' ? Promise.resolve() : deleteSubcategory(subcategoryDialog)} />}
    {batchEditOpen && detail && selectedTracks.length > 0 && <BatchTrackDialog projectId={detail.project.id} tracks={selectedTracks} categories={detail.categories} projectColors={detail.colors} onClose={() => setBatchEditOpen(false)} onChanged={applyBatchTrackChanges} />}
    {batchMoveOpen && detail && selectedTracks.length > 0 && <BatchTrackMoveDialog projectId={detail.project.id} tracks={selectedTracks} categories={detail.categories} subcategories={detail.subcategories} onClose={() => setBatchMoveOpen(false)} onChanged={(tracks) => { setBatchMoveOpen(false); applyBatchTrackChanges(tracks); }} />}
    {folderImportFiles && <FolderImportDialog files={folderImportFiles} destinationName={currentCategory?.name ?? 'Sans catégorie'} onClose={() => setFolderImportFiles(undefined)} onConfirm={(mode) => {
      const files = folderImportFiles;
      setFolderImportFiles(undefined);
      uploadDroppedFiles(files, mode).catch((cause) => setError(cause instanceof Error ? cause.message : 'Import du dossier impossible.'));
    }} />}
    {selectionRectangle && <div className="selection-marquee" style={{ left: Math.min(selectionRectangle.startX, selectionRectangle.currentX), top: Math.min(selectionRectangle.startY, selectionRectangle.currentY), width: Math.abs(selectionRectangle.currentX - selectionRectangle.startX), height: Math.abs(selectionRectangle.currentY - selectionRectangle.startY) }} aria-hidden="true" />}
    {(fileDropActive || dropUploadProgress) && <div className={`file-drop-overlay ${dropUploadProgress ? 'is-uploading' : ''}`} role="status" aria-live="polite">
      <div className="file-drop-card">
        {dropUploadProgress ? <LoaderCircle className="spin" size={38} /> : <Upload size={42} />}
        <strong>{dropUploadProgress ? `Import ${dropUploadProgress.done}/${dropUploadProgress.total}` : `Déposer dans ${currentCategory?.name ?? 'Sans catégorie'}`}</strong>
        <span>{dropUploadProgress?.filename ?? 'Fichiers ou dossiers · MP3, WAV, OGG, FLAC, M4A ou AAC'}</span>
        {dropUploadProgress && <i><b style={{ transform: `scaleX(${dropUploadProgress.total ? dropUploadProgress.done / dropUploadProgress.total : 0})` }} /></i>}
      </div>
    </div>}
    {noticesEnabled && !automaticUpdates && updateAvailable && <AppUpdateBanner playbackActive={activePlaybacks.length > 0} onApply={() => { if (!applyAppUpdate()) setError('La mise à jour n’est plus disponible.'); }} />}
    {shortcutNotice && <Toast message={shortcutNotice} onClose={() => setShortcutNotice('')} />}
    {error && <Toast message={error} onClose={() => setError('')} />}
  </div>;
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onClose, 5000); return () => window.clearTimeout(timer); }, [onClose]);
  return <div className="toast"><span>{message}</span><button onClick={onClose}><X size={16} /></button></div>;
}

function readCache<T>(key: string): T | undefined {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : undefined;
  } catch {
    return undefined;
  }
}

function readNumber(key: string, fallback: number): number {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? Math.min(220, Math.max(82, value)) : fallback;
}

function readNumberRange(key: string, fallback: number, min: number, max: number): number {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  const value = Number(stored);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function categoryStorageKey(projectId: string): string {
  return `sonoriva-category:${projectId}`;
}

function trackColumnsStorageKey(projectId: string, categoryId: string, compact: boolean): string {
  return `sonoriva-track-columns:${projectId}:${categoryId}:${compact ? 'mobile' : 'desktop'}`;
}

function stopwatchStorageKey(projectId: string): string {
  return `sonoriva-stopwatch:${projectId}`;
}

function persistStopwatch(projectId: string | null, elapsedMs: number, startedAt?: number): void {
  if (!projectId) return;
  localStorage.setItem(stopwatchStorageKey(projectId), JSON.stringify({ elapsedMs, startedAt }));
}

function formatPlaybackDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function formatStopwatch(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function formatClock(timestamp: number): string {
  return clockFormatter.format(timestamp);
}

const PlaybackPositionControl = memo(function PlaybackPositionControl({ playback, title }: { playback: ActivePlayback; title: string }) {
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const remainingRef = useRef<HTMLSpanElement>(null);
  const seekRef = useRef<HTMLInputElement>(null);
  const seekingRef = useRef(false);
  const initialPositionMs = playbackPositionAt(playback);
  const { durationMs, elapsedMs, id, loop, paused, resumedAtMs } = playback;

  const displayPosition = useCallback((positionMs: number) => {
    if (seekRef.current) {
      seekRef.current.valueAsNumber = Math.round(positionMs);
      seekRef.current.style.setProperty('--slider-progress', `${Math.min(100, Math.max(0, positionMs / durationMs * 100))}%`);
    }
    if (elapsedRef.current) elapsedRef.current.textContent = formatPlaybackDuration(positionMs);
    if (remainingRef.current) remainingRef.current.textContent = `−${formatPlaybackDuration(Math.max(0, durationMs - positionMs))}`;
  }, [durationMs]);

  useEffect(() => {
    let frame: number | undefined;
    const update = () => {
      if (!seekingRef.current) displayPosition(playbackPositionAt({ durationMs, elapsedMs, loop, paused, resumedAtMs }));
      if (!paused) frame = requestAnimationFrame(update);
    };
    update();
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [displayPosition, durationMs, elapsedMs, id, loop, paused, resumedAtMs]);

  return <div className="player-card-time">
    <span ref={elapsedRef}>{formatPlaybackDuration(initialPositionMs)}</span>
    <input ref={seekRef} className="player-card-seek" type="range" min="0" max={durationMs} step="10" defaultValue={Math.round(initialPositionMs)} disabled={playback.fadingOut} style={{ '--slider-progress': `${Math.min(100, Math.max(0, initialPositionMs / durationMs * 100))}%` } as React.CSSProperties}
      onPointerDown={() => { seekingRef.current = true; }} onPointerUp={() => { seekingRef.current = false; }} onPointerCancel={() => { seekingRef.current = false; }} onBlur={() => { seekingRef.current = false; }}
      onChange={(event) => {
        const positionMs = Number(event.target.value);
        displayPosition(positionMs);
        audioEngine.seekInstance(playback.id, positionMs / durationMs);
      }} aria-label={`Position de lecture de ${title}`} title="Cliquer ou glisser pour déplacer la lecture" />
    <span ref={remainingRef}>−{formatPlaybackDuration(Math.max(0, durationMs - initialPositionMs))}</span>
  </div>;
});

function PlaybackVolumeControl({ playback, title }: { playback: ActivePlayback; title: string }) {
  const [displayVolume, setDisplayVolume] = useState(() => playbackVolumeAt(playback));
  const { id, volume, volumeFrom, volumeTransitionDurationMs, volumeTransitionStartedAtMs } = playback;

  useEffect(() => {
    let frame: number | undefined;
    const update = () => {
      const nextVolume = playbackVolumeAt({ volume, volumeFrom, volumeTransitionDurationMs, volumeTransitionStartedAtMs });
      setDisplayVolume(nextVolume);
      if (performance.now() < volumeTransitionStartedAtMs + volumeTransitionDurationMs) {
        frame = requestAnimationFrame(update);
      }
    };
    update();
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [id, volume, volumeFrom, volumeTransitionDurationMs, volumeTransitionStartedAtMs]);

  const percentage = Math.round(displayVolume * 100);
  return <label className="player-card-volume"><Volume2 size={14} /><input type="range" min="0" max="100" value={percentage} disabled={playback.fadingOut} style={{ '--slider-progress': `${percentage}%` } as React.CSSProperties} onPointerUp={(event) => event.currentTarget.blur()} onPointerCancel={(event) => event.currentTarget.blur()} onChange={(event) => {
    const nextVolume = Number(event.target.value) / 100;
    setDisplayVolume(nextVolume);
    audioEngine.setInstanceVolume(playback.id, nextVolume);
  }} aria-label={`Volume de ${title}`} /><em>{percentage}</em></label>;
}

function moveById<T extends { id: string }>(items: T[], movingId: string, targetId?: string, after = false): T[] {
  const moving = items.find((item) => item.id === movingId);
  if (!moving) return items;
  const reordered = items.filter((item) => item.id !== movingId);
  const targetIndex = targetId ? reordered.findIndex((item) => item.id === targetId) : -1;
  const destination = targetIndex < 0 ? reordered.length : targetIndex + (after ? 1 : 0);
  reordered.splice(destination, 0, moving);
  return reordered;
}
