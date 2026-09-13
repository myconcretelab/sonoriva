import { projectAccessCondition } from './ownership.js';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accountMemberships, accounts, plans, projects, tracks, users, type Account, type Plan, type Track } from '../db/schema.js';
import { evaluateStorageAllowance } from './account-access.js';
import { demoLimitsForPlan, demoMaxFileBytes, demoMaxUploads } from './demo.js';

export class AccountStorageError extends Error {
  constructor(public readonly reason: 'read-only' | 'quota-exceeded') {
    super(reason === 'quota-exceeded'
      ? 'Votre quota de stockage est atteint. Supprimez des sons ou choisissez un forfait supérieur.'
      : "Votre espace est en lecture seule. Activez un forfait pour le modifier.");
  }
}

export class DemoUploadError extends Error {
  constructor(public readonly reason: 'file-too-large' | 'file-count-exceeded', limit?: number) {
    super(reason === 'file-too-large'
      ? `La démonstration accepte des fichiers de ${formatMegabytes(limit ?? demoMaxFileBytes)} Mo maximum.`
      : `La démonstration accepte ${limit ?? demoMaxUploads} fichiers importés maximum.`);
  }
}

function formatMegabytes(bytes: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(bytes / 1024 ** 2);
}

export interface AccountContext {
  account: Account;
  plan: Plan;
  storageQuotaBytes: number;
}

export async function accountForUser(userId: string): Promise<AccountContext | null> {
  const [row] = await db.select({ account: accounts, plan: plans })
    .from(accountMemberships)
    .innerJoin(accounts, eq(accountMemberships.accountId, accounts.id))
    .innerJoin(plans, eq(accounts.planCode, plans.code))
    .where(eq(accountMemberships.userId, userId))
    .orderBy(accountMemberships.createdAt)
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    storageQuotaBytes: row.account.storageQuotaOverrideBytes ?? row.plan.storageQuotaBytes,
  };
}

export async function accountForUserProject(userId: string, projectId: string): Promise<AccountContext | null> {
  const [row] = await db.select({ account: accounts, plan: plans })
    .from(accountMemberships)
    .innerJoin(accounts, eq(accountMemberships.accountId, accounts.id))
    .innerJoin(plans, eq(accounts.planCode, plans.code))
    .innerJoin(projects, and(eq(projects.accountId, accounts.id), eq(projects.id, projectId), projectAccessCondition(userId)))
    .where(eq(accountMemberships.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    storageQuotaBytes: row.account.storageQuotaOverrideBytes ?? row.plan.storageQuotaBytes,
  };
}

export async function accountUsage(userId: string) {
  const context = await accountForUser(userId);
  if (!context) return null;
  const [usage] = await db.select({
    usedBytes: sql<number>`(select coalesce(sum(files.size_bytes), 0)::bigint from (select distinct t.storage_key, t.size_bytes from tracks t join projects p on p.id = t.project_id where p.account_id = ${projects.accountId}) files)`,
  }).from(projects)
    .leftJoin(tracks, eq(tracks.projectId, projects.id))
    .where(eq(projects.accountId, context.account.id)).groupBy(projects.accountId);
  return { ...context, usedBytes: Number(usage?.usedBytes ?? 0) };
}

export async function requireWritableAccount(userId: string): Promise<AccountContext> {
  const context = await accountForUser(userId);
  if (!context) throw new Error('Espace de travail introuvable.');
  const allowance = evaluateStorageAllowance({
    accessStatus: context.account.accessStatus,
    trialEndsAt: context.account.trialEndsAt,
    gracePeriodEndsAt: context.account.gracePeriodEndsAt,
    storageQuotaBytes: context.storageQuotaBytes,
    usedBytes: 0,
    incomingBytes: 0,
  });
  if (!allowance.allowed) throw new AccountStorageError('read-only');
  return context;
}

export async function insertTrackWithinQuota(userId: string, values: typeof tracks.$inferInsert): Promise<Track> {
  return db.transaction(async (transaction) => {
    const [membership] = await transaction.select({ account: accounts, plan: plans, projectId: projects.id, isDemo: users.isDemo })
      .from(accountMemberships)
      .innerJoin(users, eq(accountMemberships.userId, users.id))
      .innerJoin(accounts, eq(accountMemberships.accountId, accounts.id))
      .innerJoin(plans, eq(accounts.planCode, plans.code))
      .innerJoin(projects, and(eq(projects.accountId, accounts.id), eq(projects.id, values.projectId), projectAccessCondition(userId)))
      .where(eq(accountMemberships.userId, userId))
      .limit(1);
    if (!membership) throw new Error('Projet introuvable.');

    await transaction.execute(sql`select ${accounts.id} from ${accounts} where ${accounts.id} = ${membership.account.id} for update`);
    const [usage] = await transaction.select({
      usedBytes: sql<number>`(select coalesce(sum(files.size_bytes), 0)::bigint from (select distinct t.storage_key, t.size_bytes from tracks t join projects p on p.id = t.project_id where p.account_id = ${projects.accountId}) files)`,
      uploadedFiles: sql<number>`count(*) filter (where ${tracks.demoSeed} = false)::int`,
    }).from(projects)
      .leftJoin(tracks, eq(tracks.projectId, projects.id))
      .where(eq(projects.accountId, membership.account.id)).groupBy(projects.accountId);
    const demoLimits = membership.isDemo ? demoLimitsForPlan(membership.plan) : null;
    if (demoLimits && Number(values.sizeBytes) > demoLimits.maxFileBytes) throw new DemoUploadError('file-too-large', demoLimits.maxFileBytes);
    if (demoLimits && Number(usage?.uploadedFiles ?? 0) >= demoLimits.maxUploads) throw new DemoUploadError('file-count-exceeded', demoLimits.maxUploads);
    const allowance = evaluateStorageAllowance({
      accessStatus: membership.account.accessStatus,
      trialEndsAt: membership.account.trialEndsAt,
      gracePeriodEndsAt: membership.account.gracePeriodEndsAt,
      storageQuotaBytes: membership.account.storageQuotaOverrideBytes ?? membership.plan.storageQuotaBytes,
      usedBytes: Number(usage?.usedBytes ?? 0),
      incomingBytes: values.sizeBytes,
    });
    if (!allowance.allowed) throw new AccountStorageError(allowance.reason);
    const [track] = await transaction.insert(tracks).values(values).returning();
    return track;
  });
}
