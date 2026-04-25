/**
 * Retry Queue — Exponential backoff retry logic for failed chunk saves.
 *
 * Retry rules:
 *   - Max 5 attempts
 *   - Delays: 1s, 2s, 4s, 8s, 16s (exponential backoff)
 */

import { mockDb } from "./mockDb.js";
import { saveChunk } from "./storage.js";
import { generateChecksum } from "./checksum.js";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

interface RetryItem {
  chunkId: string;
  data: string;
  attempt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const queue: Map<string, RetryItem> = new Map();

function getDelay(attempt: number): number {
  // 1s, 2s, 4s, 8s, 16s
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

async function processRetry(item: RetryItem): Promise<void> {
  try {
    await saveChunk(item.chunkId, item.data);

    const checksum = generateChecksum(item.data);
    mockDb.upsert({
      chunkId: item.chunkId,
      status: "saved",
      timestamp: new Date().toISOString(),
      checksum,
      retryCount: item.attempt,
    });

    queue.delete(item.chunkId);
    console.log(`✅ Retry succeeded for chunk ${item.chunkId} on attempt ${item.attempt + 1}`);
  } catch (err) {
    const nextAttempt = item.attempt + 1;

    if (nextAttempt >= MAX_RETRIES) {
      mockDb.updateStatus(item.chunkId, "failed");
      queue.delete(item.chunkId);
      console.error(`❌ Chunk ${item.chunkId} permanently failed after ${MAX_RETRIES} retries`);
      return;
    }

    const delay = getDelay(nextAttempt);
    console.warn(
      `⚠️ Retry ${nextAttempt + 1}/${MAX_RETRIES} for chunk ${item.chunkId} in ${delay}ms`
    );

    item.attempt = nextAttempt;
    mockDb.incrementRetry(item.chunkId);

    item.timer = setTimeout(() => {
      processRetry(item);
    }, delay);
  }
}

/** Enqueue a failed chunk for retry */
export function enqueueRetry(chunkId: string, data: string): void {
  // Don't enqueue if already queued
  if (queue.has(chunkId)) {
    console.warn(`⚠️ Chunk ${chunkId} is already in the retry queue`);
    return;
  }

  const item: RetryItem = {
    chunkId,
    data,
    attempt: 0,
    timer: null,
  };

  queue.set(chunkId, item);

  const delay = getDelay(0);
  console.log(`🔄 Enqueued chunk ${chunkId} for retry — first attempt in ${delay}ms`);

  item.timer = setTimeout(() => {
    processRetry(item);
  }, delay);
}

/** Cancel all pending retries (for graceful shutdown) */
export function clearRetryQueue(): void {
  for (const [, item] of queue) {
    if (item.timer) clearTimeout(item.timer);
  }
  queue.clear();
}

/** Get the current retry queue size */
export function retryQueueSize(): number {
  return queue.size;
}
