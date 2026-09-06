import type { AccountSummary, AdminAccount, AdminOverview, AdminReleaseInfo, AdminSupportTicket, AdminUser, AuditEntry, BatchTrackUpdateInput, BridgeDevice, Category, CommercialPlan, FreesoundLicenseFilter, FreesoundSearchResult, KeyAction, MouseAction, OpenverseLicenseFilter, OpenverseSearchResult, OpenverseSource, Playlist, PlaylistEntry, Project, ProjectColor, ProjectDetail, ProjectKeyboardShortcuts, PublicDemo, PublicPlan, ReleaseInfo, SoundShowAnalysis, SubscriptionNotificationSettings, SupportMessage, SupportTicket, SupportTicketPriority, SupportTicketStatus, Track, TrackSubcategory, User } from '../types';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const hasJsonBody = init?.body !== undefined && init.body !== null && !(init.body instanceof FormData);
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: hasJsonBody ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'La requête a échoué.' }));
    throw new ApiError(body.error ?? 'La requête a échoué.', response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: User }>('/api/auth/me'),
  startDemo: () => request<{ user: User }>('/api/auth/demo', { method: 'POST' }),
  resetDemo: () => request<{ user: User }>('/api/auth/demo/reset', { method: 'POST' }),
  register: (input: { displayName: string; email: string; password: string; planCode: string; billingInterval: 'month' | 'year'; requestId: string }) =>
    request<{ user: User; checkoutUrl: string | null; checkoutRequired: boolean; checkoutError?: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  forgotPassword: (email: string) =>
    request<{ message: string }>('/api/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    request<void>('/api/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  version: () => request<{ version: string; releasedAt: string }>('/api/version'),
  releases: () => request<ReleaseInfo>('/api/releases'),
  markReleaseSeen: (version: string) => request<void>(`/api/releases/${encodeURIComponent(version)}/seen`, { method: 'POST' }),
  account: () => request<{ account: AccountSummary }>('/api/account'),
  publicPlans: () => request<{ currency: string; signupUrl: string; plans: PublicPlan[] }>('/api/public/plans'),
  publicDemo: () => request<{ demo: PublicDemo | null }>('/api/public/demo'),
  createCheckout: (input: { planCode: string; billingInterval: 'month' | 'year'; requestId: string }) =>
    request<{ url: string }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify(input) }),
  activateFreePlan: (planCode: string) =>
    request<void>('/api/billing/free-plan', { method: 'POST', body: JSON.stringify({ planCode }) }),
  createBillingPortal: () => request<{ url: string }>('/api/billing/portal', { method: 'POST' }),
  createBridgePairing: () => request<{ ticket: string; expiresAt: string }>('/api/bridge/pairings', { method: 'POST' }),
  bridgePairingStatus: (ticket: string) => request<
    | { status: 'pending' }
    | { status: 'paired'; deviceId: string; localToken: string }
    | { status: 'consumed'; deviceId: string }
  >('/api/bridge/pairings/status', { method: 'POST', body: JSON.stringify({ ticket }) }),
  bridgeDevices: () => request<{ devices: BridgeDevice[] }>('/api/bridge/devices'),
  revokeBridgeDevice: (id: string) => request<void>(`/api/bridge/devices/${id}`, { method: 'DELETE' }),
  supportTickets: () => request<{ tickets: SupportTicket[] }>('/api/support/tickets'),
  supportTicket: (id: string) => request<{ ticket: SupportTicket; messages: SupportMessage[] }>(`/api/support/tickets/${id}`),
  createSupportTicket: (input: { subject: string; body: string }) => request<{ ticket: SupportTicket }>('/api/support/tickets', { method: 'POST', body: JSON.stringify(input) }),
  replyToSupportTicket: (id: string, body: string) => request<{ message: SupportMessage }>(`/api/support/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  updateSupportTicket: (id: string, status: Extract<SupportTicketStatus, 'open' | 'resolved' | 'closed'>) => request<{ ticket: SupportTicket }>(`/api/support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  adminOverview: () => request<{ overview: AdminOverview; recentAudit: AuditEntry[] }>('/api/admin/overview'),
  adminReleases: () => request<AdminReleaseInfo>('/api/admin/releases'),
  adminNotificationSettings: () => request<{ settings: SubscriptionNotificationSettings }>('/api/admin/notification-settings'),
  updateAdminNotificationSettings: (input: Omit<SubscriptionNotificationSettings, 'telegramBotTokenConfigured'> & { telegramBotToken?: string; clearTelegramBotToken?: boolean }) => request<{ settings: SubscriptionNotificationSettings }>('/api/admin/notification-settings', { method: 'PUT', body: JSON.stringify(input) }),
  adminAccounts: (search = '') => request<{ accounts: AdminAccount[] }>(`/api/admin/accounts?search=${encodeURIComponent(search)}`),
  adminAccount: (id: string) => request<Record<string, unknown>>(`/api/admin/accounts/${id}`),
  updateAdminAccount: (id: string, input: Record<string, unknown>) => request<{ account: AdminAccount }>(`/api/admin/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  adminUsers: (search = '') => request<{ users: AdminUser[] }>(`/api/admin/users?search=${encodeURIComponent(search)}`),
  updateAdminUser: (id: string, input: { platformRole?: User['platformRole']; disabled?: boolean }) => request<{ user: AdminUser }>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  adminPlans: () => request<{ plans: CommercialPlan[] }>('/api/admin/plans'),
  createAdminPlan: (input: Omit<CommercialPlan, 'isDemoPlan' | 'accountCount' | 'createdAt' | 'updatedAt'>) => request<{ plan: CommercialPlan }>('/api/admin/plans', { method: 'POST', body: JSON.stringify(input) }),
  updateAdminPlan: (code: string, input: Partial<Omit<CommercialPlan, 'code' | 'isDemoPlan' | 'accountCount' | 'createdAt' | 'updatedAt'>>) => request<{ plan: CommercialPlan }>(`/api/admin/plans/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteAdminPlan: (code: string) => request<void>(`/api/admin/plans/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  syncAdminPlanStripe: (code: string) => request<{ billing: { environment: 'test' | 'live'; productId: string; monthlyPriceId: string | null; annualPriceId: string | null } }>(`/api/admin/plans/${encodeURIComponent(code)}/stripe-sync`, { method: 'POST' }),
  reconcileAdminAccountStripe: (id: string) => request<void>(`/api/admin/accounts/${id}/stripe-reconcile`, { method: 'POST' }),
  adminSupportTickets: (input: { search?: string; status?: SupportTicketStatus } = {}) => {
    const parameters = new URLSearchParams();
    if (input.search) parameters.set('search', input.search);
    if (input.status) parameters.set('status', input.status);
    return request<{ tickets: AdminSupportTicket[] }>(`/api/admin/support/tickets?${parameters}`);
  },
  adminSupportTicket: (id: string) => request<{ ticket: AdminSupportTicket; messages: SupportMessage[] }>(`/api/admin/support/tickets/${id}`),
  replyToAdminSupportTicket: (id: string, input: { body: string; status: Extract<SupportTicketStatus, 'awaiting_user' | 'resolved' | 'closed'> }) => request<{ message: SupportMessage }>(`/api/admin/support/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify(input) }),
  updateAdminSupportTicket: (id: string, input: { status?: SupportTicketStatus; priority?: SupportTicketPriority }) => request<{ ticket: AdminSupportTicket }>(`/api/admin/support/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  projects: () => request<{ projects: Project[] }>('/api/projects'),
  createProject: (name: string) => request<{ project: Project }>('/api/projects', {
    method: 'POST', body: JSON.stringify({ name }),
  }),
  reorderProjects: (projectIds: string[]) => request<{ projects: Project[] }>('/api/projects/reorder', {
    method: 'PATCH', body: JSON.stringify({ projectIds }),
  }),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  project: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  updateProjectActions: (projectId: string, input: { leftClickAction?: MouseAction; rightClickAction?: MouseAction; keyboardAction?: MouseAction; escapeKeyAction?: KeyAction; backspaceKeyAction?: KeyAction; shiftBackspaceKeyAction?: KeyAction; spaceKeyAction?: KeyAction; maxPlaylistGroupSize?: number; maxActivePlaybacks?: number; compactPlaybackThreshold?: number } & Partial<ProjectKeyboardShortcuts>) =>
    request<{ project: Project }>(`/api/projects/${projectId}/mouse-actions`, { method: 'PATCH', body: JSON.stringify(input) }),
  createProjectColor: (projectId: string, color: string) => request<{ projectColor: ProjectColor }>(`/api/projects/${projectId}/colors`, {
    method: 'POST', body: JSON.stringify({ color }),
  }),
  reorderProjectColors: (projectId: string, colorIds: string[]) => request<{ colors: ProjectColor[] }>(`/api/projects/${projectId}/colors/reorder`, {
    method: 'PATCH', body: JSON.stringify({ colorIds }),
  }),
  deleteProjectColor: (projectId: string, colorId: string) => request<void>(`/api/projects/${projectId}/colors/${colorId}`, { method: 'DELETE' }),
  savePlaylist: (projectId: string, playlistId: string | undefined, input: Pick<Playlist, 'name' | 'color' | 'autostart' | 'loop' | 'random' | 'showNextButton' | 'gapMs' | 'crossfadeMs' | 'categoryId'> & { items: PlaylistEntry[] }) =>
    request<{ playlist: Playlist }>(playlistId ? `/api/projects/${projectId}/playlists/${playlistId}` : `/api/projects/${projectId}/playlists`, {
      method: playlistId ? 'PATCH' : 'POST', body: JSON.stringify(input),
    }),
  positionPlaylist: (projectId: string, playlistId: string, position: number, categoryId?: string | null) => request<{ playlist: Playlist }>(`/api/projects/${projectId}/playlists/${playlistId}/position`, {
    method: 'PATCH', body: JSON.stringify(categoryId === undefined ? { position } : { position, categoryId }),
  }),
  deletePlaylist: (projectId: string, playlistId: string) => request<void>(`/api/projects/${projectId}/playlists/${playlistId}`, { method: 'DELETE' }),
  createTrackSubcategory: (projectId: string, input: { name: string; categoryId: string | null; color: string; trackIds?: string[] }) => request<{ subcategory: TrackSubcategory; tracks: Track[] }>(`/api/projects/${projectId}/subcategories`, { method: 'POST', body: JSON.stringify(input) }),
  updateTrackSubcategory: (projectId: string, subcategoryId: string, input: Partial<Pick<TrackSubcategory, 'name' | 'categoryId' | 'color' | 'position'>>) => request<{ subcategory: TrackSubcategory; tracks: Track[] }>(`/api/projects/${projectId}/subcategories/${subcategoryId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteTrackSubcategory: (projectId: string, subcategoryId: string) => request<{ tracks: Track[] }>(`/api/projects/${projectId}/subcategories/${subcategoryId}`, { method: 'DELETE' }),
  moveTrackToSubcategory: (projectId: string, trackId: string, subcategoryId: string | null) => request<{ track: Track }>(`/api/projects/${projectId}/tracks/${trackId}/subcategory`, { method: 'PATCH', body: JSON.stringify({ subcategoryId }) }),
  createCategory: (projectId: string, name: string, color: string, position?: number) =>
    request<{ category: Category }>(`/api/projects/${projectId}/categories`, {
      method: 'POST', body: JSON.stringify({ name, color, position }),
    }),
  reorderCategories: (projectId: string, categoryIds: string[]) => request<{ categories: Category[] }>(`/api/projects/${projectId}/categories/reorder`, {
    method: 'PATCH', body: JSON.stringify({ categoryIds }),
  }),
  deleteCategory: (projectId: string, categoryId: string) => request<void>(`/api/projects/${projectId}/categories/${categoryId}`, { method: 'DELETE' }),
  uploadTrack: (form: FormData) => request<{ track: Track }>('/api/tracks/upload', { method: 'POST', body: form }),
  updateTrack: (id: string, input: Partial<Pick<Track, 'title' | 'categoryId' | 'volume' | 'loop' | 'fadeInMs' | 'fadeOutMs' | 'startTimeMs' | 'endTimeMs' | 'color' | 'tags'>>) =>
    request<{ track: Track }>(`/api/tracks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  batchUpdateTracks: (input: BatchTrackUpdateInput) => request<{ tracks: Track[] }>('/api/tracks/batch', {
    method: 'PATCH', body: JSON.stringify(input),
  }),
  reorderTrack: (id: string, input: { categoryId: string | null; beforeTrackId?: string | null; subcategoryId?: string | null }) =>
    request<{ tracks: Track[] }>(`/api/tracks/${id}/reorder`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteTrack: (id: string) => request<void>(`/api/tracks/${id}`, { method: 'DELETE' }),
  analyzeSoundShow: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ analysis: SoundShowAnalysis }>('/api/imports/soundshow/analyze', { method: 'POST', body: form });
  },
  importRemoteTrack: (input: Record<string, unknown>) => request<{ track: Track }>('/api/tracks/import-remote', {
    method: 'POST', body: JSON.stringify(input),
  }),
  searchFreesound: (input: { query: string; license: FreesoundLicenseFilter; minDuration?: number; maxDuration?: number; page?: number }, signal?: AbortSignal) => {
    const parameters = new URLSearchParams({
      q: input.query,
      license: input.license,
      page: String(input.page ?? 1),
    });
    if (input.minDuration) parameters.set('minDuration', String(input.minDuration));
    if (input.maxDuration) parameters.set('maxDuration', String(input.maxDuration));
    return request<FreesoundSearchResult>(`/api/freesound/search?${parameters}`, { signal });
  },
  searchOpenverse: (input: { query: string; license: OpenverseLicenseFilter; sources: OpenverseSource[]; page?: number }, signal?: AbortSignal) => {
    const parameters = new URLSearchParams({
      q: input.query,
      license: input.license,
      sources: input.sources.join(','),
      page: String(input.page ?? 1),
    });
    return request<OpenverseSearchResult>(`/api/openverse/search?${parameters}`, { signal });
  },
};
