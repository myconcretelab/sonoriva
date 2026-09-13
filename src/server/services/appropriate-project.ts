import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accounts, categories, plans, playlistItems, playlists, projectColors, projects, tracks, trackSubcategories } from '../db/schema.js';
import { accountForUser, AccountStorageError } from './accounts.js';
import { evaluateStorageAllowance } from './account-access.js';
import { projectLimitReached } from './commercial-plans.js';
import { MembershipError } from './memberships.js';
import { projectAccessCondition } from './ownership.js';

export async function appropriateProject(userId: string, sourceId: string, name: string) {
  const context = await accountForUser(userId);
  if (!context) throw new MembershipError('Compte introuvable.');
  return db.transaction(async (tx) => {
    // Serializes ownership changes, sharing changes and project quota checks.
    await tx.execute(sql`select id from accounts where id = ${context.account.id} for update`);
    const [current] = await tx.select({ account: accounts, plan: plans }).from(accounts)
      .innerJoin(plans, eq(plans.code, accounts.planCode)).where(eq(accounts.id, context.account.id));
    const allowance = evaluateStorageAllowance({ ...current.account, storageQuotaBytes: null, usedBytes: 0, incomingBytes: 0 });
    if (!allowance.allowed) throw new AccountStorageError('read-only');
    const [source] = await tx.select().from(projects).where(and(
      eq(projects.id, sourceId), eq(projects.accountId, context.account.id), ne(projects.userId, userId), projectAccessCondition(userId),
    )).for('update');
    if (!source) throw new MembershipError('Ce spectacle n’est pas partagé avec vous.');
    const owned = await tx.select({ position: projects.position }).from(projects)
      .where(and(eq(projects.accountId, context.account.id), eq(projects.userId, userId)));
    if (projectLimitReached(current.plan.maxProjects, owned.length)) throw new MembershipError('La limite de spectacles personnels de votre forfait est atteinte.');

    // Lock the source graph before remapping it: a concurrent deletion must not
    // remove a media file or a referenced category while its copy is created.
    const sourceCategories = await tx.select().from(categories).where(eq(categories.projectId, sourceId)).for('share');
    const sourceColors = await tx.select().from(projectColors).where(eq(projectColors.projectId, sourceId)).for('share');
    const sourceGroups = await tx.select().from(trackSubcategories).where(eq(trackSubcategories.projectId, sourceId)).for('share');
    const sourceTracks = await tx.select().from(tracks).where(eq(tracks.projectId, sourceId)).for('share');
    const sourcePlaylists = await tx.select().from(playlists).where(eq(playlists.projectId, sourceId)).for('share');
    const sourceItems = sourcePlaylists.length ? await tx.select().from(playlistItems)
      .where(inArray(playlistItems.playlistId, sourcePlaylists.map((playlist) => playlist.id))).for('share') : [];
    const categoryIds = new Map(sourceCategories.map((item) => [item.id, randomUUID()]));
    const groupIds = new Map(sourceGroups.map((item) => [item.id, randomUUID()]));
    const trackIds = new Map(sourceTracks.map((item) => [item.id, randomUUID()]));
    const playlistIds = new Map(sourcePlaylists.map((item) => [item.id, randomUUID()]));
    const now = new Date();
    const [project] = await tx.insert(projects).values({
      ...source, id: randomUUID(), userId, name, position: Math.max(-1, ...owned.map((item) => item.position)) + 1,
      createdAt: now, updatedAt: now,
    }).returning();
    for (let offset = 0; offset < sourceCategories.length; offset += 200) await tx.insert(categories).values(sourceCategories.slice(offset, offset + 200).map((item) => ({ ...item, id: categoryIds.get(item.id)!, projectId: project.id })));
    for (let offset = 0; offset < sourceColors.length; offset += 200) await tx.insert(projectColors).values(sourceColors.slice(offset, offset + 200).map((item) => ({ ...item, id: randomUUID(), projectId: project.id })));
    for (let offset = 0; offset < sourceGroups.length; offset += 200) await tx.insert(trackSubcategories).values(sourceGroups.slice(offset, offset + 200).map((item) => ({
      ...item, id: groupIds.get(item.id)!, projectId: project.id, categoryId: item.categoryId ? categoryIds.get(item.categoryId)! : null, createdAt: now, updatedAt: now,
    })));
    for (let offset = 0; offset < sourceTracks.length; offset += 200) await tx.insert(tracks).values(sourceTracks.slice(offset, offset + 200).map((item) => ({
      ...item, id: trackIds.get(item.id)!, projectId: project.id, categoryId: item.categoryId ? categoryIds.get(item.categoryId)! : null,
      subcategoryId: item.subcategoryId ? groupIds.get(item.subcategoryId)! : null, createdAt: now,
    })));
    for (let offset = 0; offset < sourcePlaylists.length; offset += 200) await tx.insert(playlists).values(sourcePlaylists.slice(offset, offset + 200).map((item) => ({
      ...item, id: playlistIds.get(item.id)!, projectId: project.id, categoryId: item.categoryId ? categoryIds.get(item.categoryId)! : null, createdAt: now, updatedAt: now,
    })));
    for (let offset = 0; offset < sourceItems.length; offset += 200) await tx.insert(playlistItems).values(sourceItems.slice(offset, offset + 200).map((item) => ({
      ...item, id: randomUUID(), playlistId: playlistIds.get(item.playlistId)!, trackId: trackIds.get(item.trackId)!,
    })));
    // Deliberately no projectShares: the new spectacle belongs only to its creator.
    return project;
  });
}
