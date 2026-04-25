/**
 * Mock Database — In-memory store for chunk metadata.
 * Replaces PostgreSQL/Drizzle when no real DB is available.
 */

export interface ChunkMeta {
  chunkId: string;
  status: "pending" | "saved" | "verified" | "failed";
  timestamp: string;
  checksum: string;
  retryCount: number;
}

const store: Map<string, ChunkMeta> = new Map();

export const mockDb = {
  /** Insert or update chunk metadata */
  upsert(meta: ChunkMeta): void {
    store.set(meta.chunkId, { ...meta });
  },

  /** Get metadata for a specific chunk */
  get(chunkId: string): ChunkMeta | undefined {
    return store.get(chunkId);
  },

  /** Get all chunk metadata entries */
  getAll(): ChunkMeta[] {
    return Array.from(store.values());
  },

  /** Update the status of a chunk */
  updateStatus(chunkId: string, status: ChunkMeta["status"]): boolean {
    const existing = store.get(chunkId);
    if (!existing) return false;
    existing.status = status;
    existing.timestamp = new Date().toISOString();
    store.set(chunkId, existing);
    return true;
  },

  /** Increment retry count */
  incrementRetry(chunkId: string): number {
    const existing = store.get(chunkId);
    if (!existing) return -1;
    existing.retryCount += 1;
    store.set(chunkId, existing);
    return existing.retryCount;
  },

  /** Delete chunk metadata */
  delete(chunkId: string): boolean {
    return store.delete(chunkId);
  },

  /** Count of all stored chunks */
  count(): number {
    return store.size;
  },
};
