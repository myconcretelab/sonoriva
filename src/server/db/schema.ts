import {
  bigint,
  boolean,
  integer,
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  primaryKey,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  platformRole: text('platform_role').notNull().default('user'),
  isDemo: boolean('is_demo').notNull().default(false),
  demoExpiresAt: timestamp('demo_expires_at', { withTimezone: true }),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  lastSeenRelease: text('last_seen_release'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const plans = pgTable('plans', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  storageQuotaBytes: bigint('storage_quota_bytes', { mode: 'number' }).notNull(),
  monthlyPriceCents: integer('monthly_price_cents'),
  annualPriceCents: integer('annual_price_cents'),
  trialDays: integer('trial_days').notNull().default(14),
  isDefault: boolean('is_default').notNull().default(false),
  active: boolean('active').notNull().default(true),
  visibleOnWebsite: boolean('visible_on_website').notNull().default(false),
  featuredOnWebsite: boolean('featured_on_website').notNull().default(false),
  customLayoutsEnabled: boolean('custom_layouts_enabled').notNull().default(true),
  playlistsEnabled: boolean('playlists_enabled').notNull().default(true),
  remoteControlEnabled: boolean('remote_control_enabled').notNull().default(true),
  maxProjects: integer('max_projects'),
  isDemoPlan: boolean('is_demo_plan').notNull().default(false),
  demoLifetimeHours: integer('demo_lifetime_hours'),
  demoMaxUploads: integer('demo_max_uploads'),
  demoMaxFileBytes: bigint('demo_max_file_bytes', { mode: 'number' }),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  planCode: text('plan_code').notNull().references(() => plans.code),
  accessStatus: text('access_status').notNull().default('trialing'),
  isDemo: boolean('is_demo').notNull().default(false),
  storageQuotaOverrideBytes: bigint('storage_quota_override_bytes', { mode: 'number' }),
  trialStartedAt: timestamp('trial_started_at', { withTimezone: true }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  gracePeriodEndsAt: timestamp('grace_period_ends_at', { withTimezone: true }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('manual'),
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id'),
  providerPriceId: text('provider_price_id'),
  status: text('status').notNull().default('none'),
  billingInterval: text('billing_interval'),
  currentPeriodStartsAt: timestamp('current_period_starts_at', { withTimezone: true }),
  currentPeriodEndsAt: timestamp('current_period_ends_at', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  lastProviderEventCreatedAt: timestamp('last_provider_event_created_at', { withTimezone: true }),
  lastProviderEventId: text('last_provider_event_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('subscriptions_account_id_idx').on(table.accountId),
  uniqueIndex('subscriptions_provider_subscription_id_idx').on(table.provider, table.providerSubscriptionId),
]);

export const billingPriceMappings = pgTable('billing_price_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  planCode: text('plan_code').notNull().references(() => plans.code, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('stripe'),
  environment: text('environment').notNull(),
  billingInterval: text('billing_interval').notNull(),
  providerProductId: text('provider_product_id').notNull(),
  providerPriceId: text('provider_price_id').notNull(),
  currency: text('currency').notNull().default('eur'),
  unitAmountCents: integer('unit_amount_cents').notNull(),
  activeForSales: boolean('active_for_sales').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('billing_price_mappings_provider_price_idx').on(table.provider, table.providerPriceId),
  index('billing_price_mappings_plan_interval_idx').on(table.planCode, table.environment, table.billingInterval, table.activeForSales),
]);

export const billingEvents = pgTable('billing_events', {
  providerEventId: text('provider_event_id').primaryKey(),
  provider: text('provider').notNull().default('stripe'),
  type: text('type').notNull(),
  livemode: boolean('livemode').notNull(),
  status: text('status').notNull().default('received'),
  attempts: integer('attempts').notNull().default(1),
  lastError: text('last_error'),
  providerCreatedAt: timestamp('provider_created_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => [
  index('billing_events_status_idx').on(table.status),
  index('billing_events_received_at_idx').on(table.receivedAt),
]);

export const notificationSettings = pgTable('notification_settings', {
  id: integer('id').primaryKey().default(1),
  emailEnabled: boolean('email_enabled').notNull().default(false),
  emailRecipient: text('email_recipient'),
  telegramEnabled: boolean('telegram_enabled').notNull().default(false),
  telegramBotToken: text('telegram_bot_token'),
  telegramChatId: text('telegram_chat_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const planSubscriptionNotifications = pgTable('plan_subscription_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  dedupeKey: text('dedupe_key').notNull().unique(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  planCode: text('plan_code').notNull().references(() => plans.code),
  emailSent: boolean('email_sent').notNull().default(false),
  telegramSent: boolean('telegram_sent').notNull().default(false),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accountMemberships = pgTable('account_memberships', {
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.accountId, table.userId] }),
  index('account_memberships_user_id_idx').on(table.userId),
]);

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('sessions_user_id_idx').on(table.userId), index('sessions_expires_at_idx').on(table.expiresAt)]);

export const passwordResetTokens = pgTable('password_reset_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('password_reset_tokens_user_id_idx').on(table.userId),
  index('password_reset_tokens_expires_at_idx').on(table.expiresAt),
]);

export const bridgeDevices = pgTable('bridge_devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  platform: text('platform').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bridge_devices_account_id_idx').on(table.accountId),
  index('bridge_devices_token_hash_idx').on(table.tokenHash),
]);

export const bridgePairingTickets = pgTable('bridge_pairing_tickets', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  claimedDeviceId: uuid('claimed_device_id').references(() => bridgeDevices.id, { onDelete: 'set null' }),
  localToken: text('local_token'),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('bridge_pairing_tickets_account_id_idx').on(table.accountId),
  index('bridge_pairing_tickets_expires_at_idx').on(table.expiresAt),
]);

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  leftClickAction: text('left_click_action').notNull().default('start'),
  rightClickAction: text('right_click_action').notNull().default('crossfade'),
  keyboardAction: text('keyboard_action').notNull().default('start'),
  escapeKeyAction: text('escape_key_action').notNull().default('stop-all'),
  backspaceKeyAction: text('backspace_key_action').notNull().default('stop-last-immediate'),
  shiftBackspaceKeyAction: text('shift_backspace_key_action').notNull().default('stop-last'),
  spaceKeyAction: text('space_key_action').notNull().default('stop-all-immediate'),
  nextCategoryShortcut: text('next_category_shortcut').notNull().default('Tab'),
  previousCategoryShortcut: text('previous_category_shortcut').notNull().default('Control+Tab'),
  startTrackShortcut: text('start_track_shortcut').notNull().default('TrackKey'),
  crossfadeTrackShortcut: text('crossfade_track_shortcut').notNull().default('Control+TrackKey'),
  loadCategoryShortcut: text('load_category_shortcut').notNull().default('AltGraph'),
  secondaryOutputHoldShortcut: text('secondary_output_hold_shortcut').notNull().default('Shift'),
  toggleOutputShortcut: text('toggle_output_shortcut').notNull().default('CapsLock'),
  masterVolumeUpShortcut: text('master_volume_up_shortcut').notNull().default('Plus'),
  masterVolumeUpFastShortcut: text('master_volume_up_fast_shortcut').notNull().default('Control+Plus'),
  masterVolumeDownShortcut: text('master_volume_down_shortcut').notNull().default('Minus'),
  masterVolumeDownFastShortcut: text('master_volume_down_fast_shortcut').notNull().default('Control+Minus'),
  searchShortcut: text('search_shortcut').notNull().default('Primary+KeyK'),
  maxPlaylistGroupSize: integer('max_playlist_group_size').notNull().default(4),
  maxActivePlaybacks: integer('max_active_playbacks').notNull().default(8),
  compactPlaybackThreshold: integer('compact_playback_threshold').notNull().default(5),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('projects_account_id_idx').on(table.accountId)]);

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#8b5cf6'),
  position: integer('position').notNull().default(0),
}, (table) => [index('categories_project_id_idx').on(table.projectId)]);

export const projectColors = pgTable('project_colors', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  color: text('color').notNull(),
  position: integer('position').notNull().default(0),
}, (table) => [
  index('project_colors_project_id_idx').on(table.projectId),
  uniqueIndex('project_colors_project_color_idx').on(table.projectId, table.color),
]);

export const trackSubcategories = pgTable('track_subcategories', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Nouveau groupe'),
  color: text('color').notNull().default('#8b5cf6'),
  position: real('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('track_subcategories_project_id_idx').on(table.projectId), index('track_subcategories_category_id_idx').on(table.categoryId)]);

export const playlists = pgTable('playlists', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#8b5cf6'),
  autostart: boolean('autostart').notNull().default(false),
  loop: boolean('loop').notNull().default(false),
  random: boolean('random').notNull().default(false),
  showNextButton: boolean('show_next_button').notNull().default(false),
  gapMs: integer('gap_ms').notNull().default(0),
  crossfadeMs: integer('crossfade_ms').notNull().default(0),
  position: real('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('playlists_project_id_idx').on(table.projectId), index('playlists_category_id_idx').on(table.categoryId)]);

export const tracks = pgTable('tracks', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  subcategoryId: uuid('subcategory_id').references(() => trackSubcategories.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  originalFilename: text('original_filename').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  mimeType: text('mime_type').notNull(),
  videoEndBehavior: text('video_end_behavior').notNull().default('black'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  durationMs: integer('duration_ms'),
  startTimeMs: integer('start_time_ms').notNull().default(0),
  endTimeMs: integer('end_time_ms'),
  volume: real('volume').notNull().default(1),
  loop: boolean('loop').notNull().default(false),
  fadeInMs: integer('fade_in_ms').notNull().default(0),
  fadeOutMs: integer('fade_out_ms').notNull().default(400),
  color: text('color'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  description: text('description'),
  copyrightText: text('copyright_text'),
  sourceUrl: text('source_url'),
  sourceId: text('source_id'),
  demoSeed: boolean('demo_seed').notNull().default(false),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('tracks_project_id_idx').on(table.projectId), index('tracks_category_id_idx').on(table.categoryId), index('tracks_subcategory_id_idx').on(table.subcategoryId)]);

export const playlistItems = pgTable('playlist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  playlistId: uuid('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  trackId: uuid('track_id').notNull().references(() => tracks.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  rowIndex: integer('row_index').notNull().default(0),
}, (table) => [index('playlist_items_playlist_id_idx').on(table.playlistId), index('playlist_items_track_id_idx').on(table.trackId)]);

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  status: text('status').notNull().default('open'),
  priority: text('priority').notNull().default('normal'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  userLastReadAt: timestamp('user_last_read_at', { withTimezone: true }).notNull().defaultNow(),
  adminLastReadAt: timestamp('admin_last_read_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('support_tickets_account_id_idx').on(table.accountId),
  index('support_tickets_created_by_user_id_idx').on(table.createdByUserId),
  index('support_tickets_status_last_message_idx').on(table.status, table.lastMessageAt),
]);

export const supportMessages = pgTable('support_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  authorKind: text('author_kind').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('support_messages_ticket_id_created_at_idx').on(table.ticketId, table.createdAt),
  index('support_messages_author_user_id_idx').on(table.authorUserId),
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_logs_actor_user_id_idx').on(table.actorUserId),
  index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  index('audit_logs_created_at_idx').on(table.createdAt),
]);

export type User = typeof users.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type BillingPriceMapping = typeof billingPriceMappings.$inferSelect;
export type BridgeDevice = typeof bridgeDevices.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectColor = typeof projectColors.$inferSelect;
export type TrackSubcategory = typeof trackSubcategories.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Track = typeof tracks.$inferSelect;
export type PlaylistItem = typeof playlistItems.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
