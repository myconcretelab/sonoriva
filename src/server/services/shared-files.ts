import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { tracks } from '../db/schema.js';

// Copies and final file removal share the same transaction-scoped lock.
export async function removeUnreferencedFiles(keys: string[]): Promise<void> {
  for (const key of [...new Set(keys)].sort()) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      const [reference] = await tx.select({ id: tracks.id }).from(tracks).where(eq(tracks.storageKey, key)).limit(1);
      if (reference) return;
      await unlink(path.join(config.STORAGE_PATH, key)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    });
  }
}
