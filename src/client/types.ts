export interface User {
  id: string;
  email: string;
  displayName: string;
  platformRole: 'user' | 'support' | 'admin' | 'super_admin';
  isDemo: boolean;
  demoExpiresAt: string | null;
}

export interface BridgeDevice {
  id: string;
  name: string;
  platform: 'macos' | 'windows' | 'linux';
  lastSeenAt: string | null;
  createdAt: string;
}

export interface AppRelease {
  audience: 'app' | 'admin';
  version: string;
  date: string;
  title: string;
  summary: string;
  important: boolean;
  changes: string[];
}

export interface AdminReleaseInfo {
  currentVersion: string;
  releases: AppRelease[];
}

export interface ReleaseInfo {
  currentVersion: string;
  releases: AppRelease[];
  unseenVersions: string[];
}

export type MouseAction = 'start' | 'crossfade' | 'fade-in' | 'replace' | 'stop' | 'none';
export type KeyAction = 'stop-all' | 'stop-all-immediate' | 'stop-last' | 'stop-last-immediate' | 'none';

export interface ProjectKeyboardShortcuts {
  nextCategoryShortcut: string;
  previousCategoryShortcut: string;
  startTrackShortcut: string;
  crossfadeTrackShortcut: string;
  loadCategoryShortcut: string;
  secondaryOutputHoldShortcut: string;
  toggleOutputShortcut: string;
  masterVolumeUpShortcut: string;
  masterVolumeUpFastShortcut: string;
  masterVolumeDownShortcut: string;
  masterVolumeDownFastShortcut: string;
  searchShortcut: string;
}

export type ProjectKeyboardShortcutKey = keyof ProjectKeyboardShortcuts;

export interface Project extends ProjectKeyboardShortcuts {
  id: string;
  name: string;
  accountId: string;
  leftClickAction: MouseAction;
  rightClickAction: MouseAction;
  keyboardAction: MouseAction;
  escapeKeyAction: KeyAction;
  backspaceKeyAction: KeyAction;
  shiftBackspaceKeyAction: KeyAction;
  spaceKeyAction: KeyAction;
  maxPlaylistGroupSize: number;
  maxActivePlaybacks: number;
  compactPlaybackThreshold: number;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistEntry {
  trackId: string;
  rowIndex: number;
}

export interface AccountSummary {
  id: string;
  name: string;
  planCode: string;
  planName: string;
  accessStatus: 'trialing' | 'active' | 'grace_period' | 'read_only' | 'suspended';
  storageQuotaBytes: number | null;
  storageUsedBytes: number;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  bridgeAvailable: boolean;
  features: PlanFeatures;
  demoLimits: {
    lifetimeHours: number;
    maxUploads: number;
    maxFileBytes: number;
  } | null;
  billing: {
    membershipRole: string;
    provider: string;
    status: string;
    billingInterval: string | null;
    currentPeriodEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    checkoutAvailable: boolean;
    customerPortalAvailable: boolean;
  } | null;
}

export interface PlanFeatures {
  customLayouts: boolean;
  playlists: boolean;
  remoteControl: boolean;
  maxProjects: number | null;
}

export interface PublicPlan {
  code: string;
  name: string;
  description: string;
  storageQuotaBytes: number;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  trialDays: number;
  free: boolean;
  bridgeIncluded: boolean;
  features: PlanFeatures;
  featured: boolean;
  displayOrder: number;
}

export interface PublicDemo {
  storageQuotaBytes: number;
  lifetimeHours: number;
  maxUploads: number;
  maxFileBytes: number;
  features: PlanFeatures;
}

export interface CommercialPlan {
  code: string;
  name: string;
  description: string;
  storageQuotaBytes: number;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  trialDays: number;
  isDefault: boolean;
  active: boolean;
  visibleOnWebsite: boolean;
  featuredOnWebsite: boolean;
  customLayoutsEnabled: boolean;
  playlistsEnabled: boolean;
  remoteControlEnabled: boolean;
  maxProjects: number | null;
  isDemoPlan: boolean;
  demoLifetimeHours: number | null;
  demoMaxUploads: number | null;
  demoMaxFileBytes: number | null;
  displayOrder: number;
  accountCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOverview {
  users: number;
  accounts: number;
  trialingAccounts: number;
  activeAccounts: number;
  restrictedAccounts: number;
  storageUsedBytes: number;
}

export interface SubscriptionNotificationSettings {
  emailEnabled: boolean;
  emailRecipient: string;
  telegramEnabled: boolean;
  telegramBotTokenConfigured: boolean;
  telegramChatId: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
  actorEmail: string | null;
}

export interface AdminAccount {
  id: string;
  name: string;
  planCode: string;
  planName: string;
  accessStatus: AccountSummary['accessStatus'];
  trialEndsAt: string | null;
  storageQuotaOverrideBytes: number | null;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  memberCount: number;
  projectCount: number;
  subscriptionStatus: string | null;
  billingInterval: string | null;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  platformRole: User['platformRole'];
  disabledAt: string | null;
  createdAt: string;
  accountCount: number;
}

export type SupportTicketStatus = 'open' | 'awaiting_user' | 'resolved' | 'closed';
export type SupportTicketPriority = 'normal' | 'high' | 'urgent';

export interface SupportTicket {
  id: string;
  accountId: string;
  createdByUserId: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  messageCount: number;
  unreadCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorUserId: string | null;
  authorKind: 'user' | 'admin';
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface AdminSupportTicket extends SupportTicket {
  userName: string;
  userEmail: string;
  accountName: string;
  accountStatus: AccountSummary['accessStatus'];
  planCode: string;
  planName: string;
  storageQuotaBytes: number;
  storageUsedBytes: number;
}

export interface Category {
  id: string;
  projectId: string;
  name: string;
  color: string;
  position: number;
}

export interface TrackSubcategory {
  id: string;
  projectId: string;
  categoryId: string | null;
  name: string;
  color: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectColor {
  id: string;
  projectId: string;
  color: string;
  position: number;
}

export interface Playlist {
  id: string;
  projectId: string;
  categoryId: string | null;
  name: string;
  color: string;
  autostart: boolean;
  loop: boolean;
  random: boolean;
  showNextButton: boolean;
  gapMs: number;
  crossfadeMs: number;
  position: number;
  trackIds: string[];
  items: PlaylistEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Track {
  id: string;
  projectId: string;
  categoryId: string | null;
  subcategoryId: string | null;
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number | null;
  startTimeMs: number;
  endTimeMs: number | null;
  volume: number;
  loop: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  color: string | null;
  tags: string[];
  description: string | null;
  copyrightText: string | null;
  sourceUrl: string | null;
  sourceId: string | null;
  position: number;
  createdAt: string;
}

export interface BatchTrackUpdateInput {
  projectId: string;
  trackIds: string[];
  updates?: Partial<Pick<Track, 'categoryId' | 'subcategoryId' | 'volume' | 'loop' | 'fadeInMs' | 'fadeOutMs' | 'color'>>;
  tagChange?: { mode: 'add' | 'remove' | 'replace'; tags: string[] };
}

export interface ProjectDetail {
  project: Project;
  colors: ProjectColor[];
  playlists: Playlist[];
  subcategories: TrackSubcategory[];
  categories: Category[];
  tracks: Track[];
}

export interface SoundShowTrack {
  sourceId: string;
  categorySourceId: string;
  title: string;
  path: string | null;
  url: string | null;
  durationMs: number | null;
  startTimeMs: number;
  endTimeMs: number | null;
  loop: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  color: string | null;
  description: string | null;
  copyrightText: string | null;
  position: number;
}

export interface SoundShowAnalysis {
  name: string;
  releaseDate: string | null;
  relativePaths: boolean;
  categories: Array<{ sourceId: string; name: string; color: string; position: number }>;
  tracks: SoundShowTrack[];
  playlists: Array<{ name: string; sourceTrackIds: string[]; loop: boolean }>;
  warnings: string[];
}

export type FreesoundLicenseFilter = 'compatible' | 'cc0' | 'by';

export interface FreesoundSound {
  id: number;
  name: string;
  username: string;
  durationSeconds: number;
  previewUrl: string;
  pageUrl: string;
  tags: string[];
  license: {
    code: 'cc0' | 'by';
    label: string;
    url: string;
    attributionRequired: boolean;
  };
}

export interface FreesoundSearchResult {
  count: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  results: FreesoundSound[];
}

export type OpenverseSource = 'freesound' | 'jamendo' | 'wikimedia_audio' | 'ccmixter';
export type OpenverseLicenseFilter = 'all' | 'cc0' | 'by';

export interface OpenverseSound {
  id: string;
  name: string;
  username: string;
  durationSeconds: number;
  previewUrl: string;
  pageUrl: string;
  tags: string[];
  source: OpenverseSource;
  sourceLabel: string;
  license: {
    code: string;
    label: string;
    url: string;
    attributionRequired: boolean;
  };
}

export interface OpenverseSearchResult {
  count: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  results: OpenverseSound[];
}

export type RemoteCommand =
  | { type: 'play'; trackId: string; volumeMultiplier?: number; outputId?: string }
  | { type: 'stop'; trackId: string }
  | { type: 'stop-all' }
  | { type: 'stop-all-immediate' }
  | { type: 'stop-last'; immediate: boolean }
  | { type: 'run-action'; trackId: string; action: MouseAction; volumeMultiplier?: number; outputId?: string };
