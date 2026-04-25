import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { chunksRouter } from "./routes/chunks.js";
import { ensureStorageDir } from "./lib/storage.js";
import { startReconciliationWorker } from "./lib/reconciliation.js";

const PORT = Number(process.env.PORT) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3001";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: "*", // Opened up for testing so both localhost, 127.0.0.1, and Vercel domains connect seamlessly.
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

// Health check
app.get("/", (c) => {
  return c.json({ status: "OK", uptime: process.uptime() });
});

// Chunk pipeline routes
app.route("/api/chunks", chunksRouter);

// --- Bootstrap ---
async function bootstrap() {
  // Ensure storage directory exists
  await ensureStorageDir();
  console.log("📁 Storage directory ready");

  // Start reconciliation worker
  startReconciliationWorker();

  // Start HTTP server
  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Fatal error during bootstrap:", err);
  process.exit(1);
});
