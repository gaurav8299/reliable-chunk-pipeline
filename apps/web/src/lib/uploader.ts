/**
 * Uploader — Sends chunks to the backend with parallel upload limiting
 * and checksum validation.
 *
 * POST /api/chunks/upload
 * Body: { chunkId, data (base64), checksum (SHA-256) }
 *
 * Features:
 * - Parallel uploads with configurable concurrency (default 5)
 * - SHA-256 checksum for data integrity
 * - Integrates with OPFS for chunk data retrieval
 * - Deletes OPFS chunk only after confirmed server success
 */

import { readChunk, deleteChunk } from "./opfs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const MAX_CONCURRENT = 5;

/**
 * Convert a Blob to a base64-encoded string.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Compute SHA-256 hex digest of a string.
 */
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(buffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UploadResult {
  chunkId: string;
  success: boolean;
  error?: string;
}

/**
 * Upload a single chunk to the server.
 * Reads data from OPFS, computes checksum, sends to API.
 * On success, deletes the chunk from OPFS.
 *
 * @returns true if upload succeeded, false otherwise
 */
export async function uploadChunk(chunkId: string): Promise<boolean> {
  const blob = await readChunk(chunkId);
  if (!blob) {
    console.warn(`[uploader] Chunk ${chunkId} not found in OPFS`);
    return false;
  }

  const data = await blobToBase64(blob);
  const checksum = await sha256(data);

  const response = await fetch(`${API_BASE}/api/chunks/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chunkId, data, checksum }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${response.status}`);
  }

  const result = await response.json();

  if (result.success) {
    // Only delete from OPFS after confirmed server-side success
    await deleteChunk(chunkId);
    return true;
  }

  throw new Error(result.error || "Upload failed with success=false");
}

/**
 * Upload multiple chunks in parallel with concurrency limiting.
 *
 * @param chunkIds - Array of chunk IDs to upload
 * @param onProgress - Callback for each completed upload
 * @param concurrency - Max parallel uploads (default 5)
 */
export async function uploadChunksParallel(
  chunkIds: string[],
  onProgress?: (result: UploadResult) => void,
  concurrency: number = MAX_CONCURRENT
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  const pending = [...chunkIds];

  async function worker(): Promise<void> {
    while (pending.length > 0) {
      const chunkId = pending.shift();
      if (!chunkId) break;

      let result: UploadResult;
      try {
        const success = await uploadChunk(chunkId);
        result = { chunkId, success };
      } catch (err) {
        result = {
          chunkId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      results.push(result);
      onProgress?.(result);
    }
  }

  // Spawn workers up to concurrency limit
  const workers = Array.from(
    { length: Math.min(concurrency, chunkIds.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}
