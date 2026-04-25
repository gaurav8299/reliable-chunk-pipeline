/**
 * Local Storage — Manages the storage/chunks filesystem bucket.
 * Automatically creates the directory on first use.
 */

import path from "node:path";
import fs from "fs-extra";

// Resolve storage path relative to project root (apps/server/)
const STORAGE_DIR = path.resolve(process.cwd(), "storage", "chunks");

/** Ensure storage directory exists */
export async function ensureStorageDir(): Promise<void> {
  await fs.ensureDir(STORAGE_DIR);
}

/** Save chunk data to a file, returns the absolute path */
export async function saveChunk(chunkId: string, data: string): Promise<string> {
  await ensureStorageDir();
  const filePath = path.join(STORAGE_DIR, `${chunkId}.txt`);
  await fs.writeFile(filePath, data, "utf-8");
  return filePath;
}

/** Read chunk data from storage */
export async function readChunk(chunkId: string): Promise<string | null> {
  const filePath = path.join(STORAGE_DIR, `${chunkId}.txt`);
  const exists = await fs.pathExists(filePath);
  if (!exists) return null;
  return fs.readFile(filePath, "utf-8");
}

/** Check if a chunk file exists */
export async function chunkExists(chunkId: string): Promise<boolean> {
  const filePath = path.join(STORAGE_DIR, `${chunkId}.txt`);
  return fs.pathExists(filePath);
}

/** List all chunk files in storage */
export async function listChunks(): Promise<string[]> {
  await ensureStorageDir();
  const files = await fs.readdir(STORAGE_DIR);
  return files
    .filter((f: string) => f.endsWith(".txt"))
    .map((f: string) => f.replace(".txt", ""));
}

/** Delete a chunk file */
export async function deleteChunk(chunkId: string): Promise<boolean> {
  const filePath = path.join(STORAGE_DIR, `${chunkId}.txt`);
  const exists = await fs.pathExists(filePath);
  if (!exists) return false;
  await fs.remove(filePath);
  return true;
}

export { STORAGE_DIR };
