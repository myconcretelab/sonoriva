import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { accountMemberships, accounts, categories, plans, projects, subscriptions, tracks, users, type User } from '../db/schema.js';
import { CURRENT_VERSION } from '../releases.js';
import { demoAssetDirectory, demoCategories, demoSounds } from './demo-catalog.js';

export { demoCategories, demoSounds } from './demo-catalog.js';

export const demoLifetimeMs = 24 * 60 * 60 * 1000;
export const demoMaxUploads = 15;
export const demoMaxFileBytes = 5 * 1024 * 1024;

export interface DemoLimits {
  lifetimeHours: number;
  maxUploads: number;
  maxFileBytes: number;
}

export function demoLimitsForPlan(plan: { demoLifetimeHours: number | null; demoMaxUploads: number | null; demoMaxFileBytes: number | null }): DemoLimits {
  return {
    lifetimeHours: plan.demoLifetimeHours ?? 24,
    maxUploads: plan.demoMaxUploads ?? demoMaxUploads,
    maxFileBytes: plan.demoMaxFileBytes ?? demoMaxFileBytes,
  };
}

export function demoExpiration(now = new Date(), lifetimeHours = 24): Date {
  return new Date(now.getTime() + lifetimeHours * 60 * 60 * 1000);
}

export async function demoLimitsForUser(userId: string): Promise<DemoLimits> {
  const [plan] = await db.select({
    demoLifetimeHours: plans.demoLifetimeHours,
    demoMaxUploads: plans.demoMaxUploads,
    demoMaxFileBytes: plans.demoMaxFileBytes,
  }).from(accountMemberships)
    .innerJoin(accounts, eq(accountMemberships.accountId, accounts.id))
    .innerJoin(plans, eq(accounts.planCode, plans.code))
    .where(and(eq(accountMemberships.userId, userId), eq(accounts.isDemo, true)))
    .limit(1);
  if (!plan) throw new Error('Forfait de démonstration introuvable.');
  return demoLimitsForPlan(plan);
}

export async function createDemoWorkspace(now = new Date()): Promise<User> {
  await mkdir(config.STORAGE_PATH, { recursive: true });
  const [demoPlan] = await db.select().from(plans).where(and(eq(plans.isDemoPlan, true), eq(plans.active, true))).limit(1);
  if (!demoPlan) throw new Error('Aucun forfait de démonstration actif n’est configuré.');
  const demoLimits = demoLimitsForPlan(demoPlan);
  const seededFiles = await Promise.all(demoSounds.map(async (sound) => ({
    ...sound,
    key: `${randomUUID()}.mp3`,
    content: await readFile(path.join(demoAssetDirectory, sound.assetFilename)),
  })));

  try {
    await Promise.all(seededFiles.map((file) => writeFile(path.join(config.STORAGE_PATH, file.key), file.content, { flag: 'wx' })));
    return await db.transaction(async (transaction) => {
      const id = randomUUID();
      const [user] = await transaction.insert(users).values({
        id,
        email: `demo-${id}@demo.invalid`,
        displayName: 'Visiteur',
        passwordHash: 'demo-session',
        isDemo: true,
        demoExpiresAt: demoExpiration(now, demoLimits.lifetimeHours),
        lastSeenRelease: CURRENT_VERSION,
      }).returning();
      const [account] = await transaction.insert(accounts).values({
        name: 'Démo SonoRiva',
        planCode: demoPlan.code,
        accessStatus: 'active',
        isDemo: true,
      }).returning();
      await transaction.insert(accountMemberships).values({ accountId: account.id, userId: user.id, role: 'owner' });
      await transaction.insert(subscriptions).values({ accountId: account.id });
      const [project] = await transaction.insert(projects).values({ accountId: account.id, userId: user.id, name: 'Découverte de SonoRiva' }).returning();
      const seededCategories = await transaction.insert(categories).values(demoCategories.map((category, position) => ({
        projectId: project.id,
        ...category,
        position,
      }))).returning();
      const categoryIds = new Map(seededCategories.map((category) => [category.name, category.id]));
      const trackRows = seededFiles.map((file, index) => {
        const categoryId = categoryIds.get(file.category);
        if (!categoryId) throw new Error(`Catégorie de démonstration introuvable : ${file.category}.`);
        return {
          projectId: project.id,
          categoryId,
          title: file.title,
          originalFilename: file.originalFilename,
          storageKey: file.key,
          mimeType: 'audio/mpeg',
          sizeBytes: file.content.length,
          durationMs: file.durationMs,
          color: demoCategories.find((category) => category.name === file.category)?.color,
          tags: file.tags,
          description: file.description,
          copyrightText: file.copyrightText,
          sourceUrl: file.sourceUrl,
          sourceId: file.sourceId,
          position: index,
          demoSeed: true,
        };
      });
      await transaction.insert(tracks).values(trackRows);
      return user;
    });
  } catch (error) {
    await Promise.all(seededFiles.map((file) => unlink(path.join(config.STORAGE_PATH, file.key)).catch(() => undefined)));
    throw error;
  }
}

export async function removeDemoUsers(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const owned = await db.select({ accountId: accounts.id, storageKey: tracks.storageKey })
    .from(users)
    .innerJoin(accountMemberships, eq(accountMemberships.userId, users.id))
    .innerJoin(accounts, eq(accounts.id, accountMemberships.accountId))
    .leftJoin(projects, eq(projects.accountId, accounts.id))
    .leftJoin(tracks, eq(tracks.projectId, projects.id))
    .where(and(inArray(users.id, userIds), eq(users.isDemo, true)));
  const accountIds = [...new Set(owned.map((row) => row.accountId))];
  const storageKeys = owned.flatMap((row) => row.storageKey ? [row.storageKey] : []);
  await db.transaction(async (transaction) => {
    if (accountIds.length > 0) await transaction.delete(accounts).where(and(inArray(accounts.id, accountIds), eq(accounts.isDemo, true)));
    await transaction.delete(users).where(and(inArray(users.id, userIds), eq(users.isDemo, true)));
  });
  await Promise.all(storageKeys.map((key) => unlink(path.join(config.STORAGE_PATH, key)).catch(() => undefined)));
  return userIds.length;
}

export async function cleanupExpiredDemos(now = new Date()): Promise<number> {
  const expired = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.isDemo, true), lte(users.demoExpiresAt, now)));
  return removeDemoUsers(expired.map((user) => user.id));
}
