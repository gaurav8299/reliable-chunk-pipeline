/**
 * OPFS (Origin Private File System) — Browser-side chunk storage.
 *
 * Uses navigator.storage.getDirectory() to persist audio chunks
 * across page reloads, surviving crashes and network failures.
 *
 * Each chunk is stored as: {chunkId}.webm
 * Chunks are NEVER deleted until upload is confirmed successful.
 */

const CHUNKS_DIR = "chunks";

/** Get the chunks subdirectory handle inside OPFS root */
async function getChunksDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(CHUNKS_DIR, { create: true });
}

/**
 * Save a chunk blob to OPFS.
 * Overwrites if already exists.
 */
export async function saveChunk(chunkId: string, blob: Blob): Promise<void> {
  const dir = await getChunksDir();
  const fileHandle = await dir.getFileHandle(`${chunkId}.webm`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * Read a chunk blob from OPFS.
 * Returns null if the chunk doesn't exist.
 */
export async function readChunk(chunkId: string): Promise<Blob | null> {
  try {
    const dir = await getChunksDir();
    const fileHandle = await dir.getFileHandle(`${chunkId}.webm`);
    const file = await fileHandle.getFile();
    return file;
  } catch {
    return null;
  }
}

/**
 * Delete a chunk from OPFS.
 * Safe to call even if the chunk doesn't exist.
 */
export async function deleteChunk(chunkId: string): Promise<void> {
  try {
    const dir = await getChunksDir();
    await dir.removeEntry(`${chunkId}.webm`);
  } catch {
    // Ignore — file may not exist
  }
}

/**
 * List all chunk IDs stored in OPFS.
 * Returns array of chunkIds (without .webm extension).
 */
export async function listChunks(): Promise<string[]> {
  const dir = await getChunksDir();
  const ids: string[] = [];
  for await (const [name] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (name.endsWith(".webm")) {
      ids.push(name.replace(".webm", ""));
    }
  }
  return ids;
}

/**
 * Get the total number of chunks in OPFS.
 */
export async function chunkCount(): Promise<number> {
  const ids = await listChunks();
  return ids.length;
}

/**
 * Clear ALL chunks from OPFS.
 * Use with caution — typically only after all uploads confirmed.
 */
export async function clearAllChunks(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(CHUNKS_DIR, { recursive: true });
  } catch {
    // Directory may not exist
  }
  // Re-create the directory for future use
  await root.getDirectoryHandle(CHUNKS_DIR, { create: true });
}
