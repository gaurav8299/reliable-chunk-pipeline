/**
 * Chunk Upload API Routes
 *
 * POST /api/chunks/upload  — Upload a chunk with checksum validation
 * GET  /api/chunks          — List all chunks
 * GET  /api/chunks/:id      — Get a specific chunk's metadata + data
 */

import { Hono } from "hono";
import { mockDb } from "../lib/mockDb.js";
import { saveChunk, readChunk, listChunks } from "../lib/storage.js";
import { generateChecksum, verifyChecksum } from "../lib/checksum.js";
import { enqueueRetry } from "../lib/retryQueue.js";

const chunksRouter = new Hono();

/**
 * POST /api/chunks/upload
 *
 * Accepts: { chunkId: string, data: string, checksum?: string }
 * - Validates chunkId is present
 * - If checksum is provided, verifies data integrity
 * - Saves file to storage/chunks
 * - Adds metadata to mock DB
 * - Returns { success: true }
 */
chunksRouter.post("/upload", async (c) => {
  try {
    const body = await c.req.json();
    const { chunkId, data, checksum } = body as {
      chunkId?: string;
      data?: string;
      checksum?: string;
    };

    // --- Validation ---
    if (!chunkId || typeof chunkId !== "string" || chunkId.trim().length === 0) {
      return c.json({ success: false, error: "chunkId is required and must be a non-empty string" }, 400);
    }

    if (!data || typeof data !== "string") {
      return c.json({ success: false, error: "data is required and must be a string" }, 400);
    }

    // --- Checksum Validation ---
    const computedChecksum = generateChecksum(data);

    if (checksum && !verifyChecksum(data, checksum)) {
      return c.json(
        {
          success: false,
          error: "Checksum mismatch — data may be corrupted",
          expected: checksum,
          actual: computedChecksum,
        },
        422
      );
    }

    // --- Save to storage ---
    try {
      await saveChunk(chunkId, data);
    } catch (saveErr) {
      console.error(`Failed to save chunk ${chunkId}:`, saveErr);
      // Enqueue for retry
      enqueueRetry(chunkId, data);

      mockDb.upsert({
        chunkId,
        status: "pending",
        timestamp: new Date().toISOString(),
        checksum: computedChecksum,
        retryCount: 0,
      });

      return c.json(
        {
          success: true,
          warning: "Chunk enqueued for retry — initial save failed",
          chunkId,
        },
        202
      );
    }

    // --- Save metadata ---
    mockDb.upsert({
      chunkId,
      status: "verified",
      timestamp: new Date().toISOString(),
      checksum: computedChecksum,
      retryCount: 0,
    });

    return c.json({
      success: true,
      chunkId,
      checksum: computedChecksum,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Chunk upload error:", err);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

/**
 * GET /api/chunks — List all chunks in the system
 */
chunksRouter.get("/", async (c) => {
  const dbChunks = mockDb.getAll();
  const diskChunks = await listChunks();

  return c.json({
    success: true,
    count: dbChunks.length,
    diskCount: diskChunks.length,
    chunks: dbChunks,
  });
});

/**
 * GET /api/chunks/:id — Get metadata and data for a specific chunk
 */
chunksRouter.get("/:id", async (c) => {
  const chunkId = c.req.param("id");
  const meta = mockDb.get(chunkId);

  if (!meta) {
    return c.json({ success: false, error: "Chunk not found" }, 404);
  }

  const data = await readChunk(chunkId);

  return c.json({
    success: true,
    chunk: {
      ...meta,
      data,
    },
  });
});

export { chunksRouter };
