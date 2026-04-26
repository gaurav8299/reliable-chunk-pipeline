# Reliable Recording Chunking Pipeline

This repository contains a completed implementation for a fully robust, crash-resilient client-server recording pipeline. It ensures recording data stays accurate in all cases — no data loss, no silent failures, and recovers natively from connection drops and tab crashes.

---

## 🛠 Features Implemented

The full pipeline has been strictly implemented:

1. **Client-Side Chunking:** Microphone audio is recorded using `MediaRecorder` and neatly sliced into 1-second WebM chunks.
2. **OPFS Local Buffer:** Every chunk is immediately persisted to the **Origin Private File System (OPFS)** before a network request even starts. Tab closed? Network dropped? The data physically survives in the browser storage.
3. **Parallel Uploader:** A highly concurrent uploader reads from OPFS and uploads strictly 5 chunks at a time limits using a Worker Pool design to prevent locking/crashing the browser. 
4. **Data Integrity Checksums:** Chunks create a local `SHA-256` checksum via WebCrypto before transmission. The backend validates this to guarantee no corruptions over-the-wire.
5. **DB Acknowledgment:** The backend securely saves the physical chunk to the disk bucket (`storage/chunks`), and then writes a metadata acknowledgment (success flag) to the database.
6. **Smart Crash Auto-Recovery:** 
   - **On frontend Page Load:** The `/record` page actively queries OPFS on mount and automatically uploads ("reconciles") any orphaned chunks from previous aborted recording sessions.
   - **Manual Recovery Check:** A "Recover Missing Chunks" mechanism lets you scan OPFS at any point and observe recovery logs.
   - **Backend Reconciliation Worker:** Runs every 60-seconds scanning the DB to ensure every "successful" DB ack aligns with a physical file existing on the disk.
7. **Exponential Backoff Retry Queue:** Uploader incorporates an automatic retry mechanism spanning `1s → 2s → 4s → 8s → 16s` allowing temporary network interruptions to seamlessly buffer and auto-heal.

---

## 🚀 Easy Local Testing Environment

This project has been heavily adapted for a seamless local developer experience on **Windows / Node.js** systems.
- **Bun Dependency Removed:** Ported the Hono backend natively to `tsx` / `@hono/node-server`.
- **PostgreSQL Dependency Bypassed:** Abstracted `mockDb.ts` to simulate local database arrays so reviewers can pull and run instantly without spinning up Postgres instances or Docker.
- **File-system Bucket:** Replaces MinIO requirements with local `fs-extra` chunk files locally output inside `apps/server/storage/chunks`.

### How to Run Locally

You need two terminals. From the root directory:

**1. Start the API Server (Terminal 1)**
```bash
cd apps/server
npm install
npm run dev
```
*(Server boots on `http://localhost:3000`)*

**2. Start the Frontend Next.js Web App (Terminal 2)**
```bash
cd apps/web
npm install
npm run dev
```
*(Frontend boots on `http://localhost:3001`)*

---

## 🎮 How to Test and Verify Consistency

1. **Visit:** `http://localhost:3001/record`
2. **Hit "Start Recording":** Speak or make noise. You will see chunks captured by the UI dynamically in real-time.
3. **Check the Stats Dashboard:** Verify chunks transition from "Recording" -> "Saved (OPFS)" -> "Uploading..." -> "Uploaded ✓".
4. **Test Crash Recovery!** 
   - Start a recording.
   - Refresh the page aggressively in the middle of a recording.
   - You will see the auto-reconciliation step catch the "orphaned" OPFS chunks left over from the closed tab and it will forcefully upload them before restoring regular operation!
   - You can also optionally use the "Recover Missing Chunks" button to trigger manual checks.
5. **Check the local filesystem:** Explore `apps/server/storage/chunks` to witness the physical byte dumps of the audio segments properly stored.

---

## 💻 Tech Stack Summarized

- **Next.js (App Router)** & **React 18** — Frontend 
- **Tailwind CSS + Shadcn UI** — UI Styling and components
- **Hono** / **Node.js** — Backend API server
- **Web APIs** — `MediaRecorder` API, `navigator.storage.getDirectory()` (OPFS), `crypto.subtle` (Checksums)

## 📁 Project Structure highlights

```
├── apps/
│   ├── web/                     # Frontend 
│   │   ├── src/app/record/      # Chunk Recording React components and UI
│   │   └── src/lib/             # opfs.ts, uploader.ts, and clientRetryQueue.ts
│   └── server/                  # Backend API 
│       ├── src/index.ts         # Hono entrypoint (routes for /api/chunks)
│       └── src/lib/             # mockDb.ts, storage.ts, reconciliation.ts
└── packages/
    ├── ui/                      # Shared shadcn/ui components
```
