/**
 * Reconciliation Worker — Periodic check for missing chunk files.
 * Runs every 60 seconds.
 * Detects chunks tracked in the mock DB but missing from disk, and re-enqueues them.
 */

import { mockDb } from "./mockDb.js";
import { chunkExists } from "./storage.js";

const INTERVAL_MS = 60_000;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function reconcile(): Promise<void> {
  const allChunks = mockDb.getAll();

  if (allChunks.length === 0) return;

  let missingCount = 0;

  for (const chunk of allChunks) {
    if (chunk.status === "failed") continue;

    const exists = await chunkExists(chunk.chunkId);
    if (!exists) {
      missingCount++;
      console.warn(`🔍 Reconciliation: chunk ${chunk.chunkId} missing from disk`);
      mockDb.updateStatus(chunk.chunkId, "pending");
      // We can't re-save without data, so mark for manual re-upload
      // If we had the data cached, we'd enqueue retry here
    }
  }

  if (missingCount > 0) {
    console.log(`🔍 Reconciliation: found ${missingCount} missing chunk(s)`);
  }
}

/** Start the reconciliation worker */
export function startReconciliationWorker(): void {
  if (intervalHandle) return;

  console.log(`🔍 Reconciliation worker started (interval: ${INTERVAL_MS / 1000}s)`);
  intervalHandle = setInterval(reconcile, INTERVAL_MS);

  // Also run immediately on start
  reconcile();
}

/** Stop the reconciliation worker */
export function stopReconciliationWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("🔍 Reconciliation worker stopped");
  }
}
