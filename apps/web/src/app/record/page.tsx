"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  HardDrive,
  Wifi,
  WifiOff,
  ShieldCheck,
  DownloadCloud,
} from "lucide-react";

import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { toast } from "sonner";

import * as opfs from "@/lib/opfs";
import { uploadChunk, type UploadResult } from "@/lib/uploader";
import { ClientRetryQueue, type RetryTask } from "@/lib/clientRetryQueue";

/* ─── Types ────────────────────────────────────────────────────────── */

interface ChunkStatus {
  chunkId: string;
  state: "recording" | "saved" | "uploading" | "uploaded" | "failed";
  error?: string;
}

interface Stats {
  recorded: number;
  uploaded: number;
  failed: number;
  pending: number;
  retrying: number;
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ─── Page Component ───────────────────────────────────────────────── */

export default function RecordPage() {
  /* ── State ── */
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [chunks, setChunks] = useState<ChunkStatus[]>([]);
  const [retryTasks, setRetryTasks] = useState<RetryTask[]>([]);
  const [recovering, setRecovering] = useState(false);
  const [recoveredCount, setRecoveredCount] = useState(0);
  const [manualRecovering, setManualRecovering] = useState(false);
  const [recoveryLog, setRecoveryLog] = useState<string[]>([]);

  /* ── Refs ── */
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const chunkIndexRef = useRef(0);
  const retryQueueRef = useRef<ClientRetryQueue | null>(null);

  /* ── Computed stats ── */
  const stats: Stats = {
    recorded: chunks.length,
    uploaded: chunks.filter((c) => c.state === "uploaded").length,
    failed: chunks.filter((c) => c.state === "failed").length,
    pending: chunks.filter(
      (c) => c.state === "saved" || c.state === "uploading"
    ).length,
    retrying: retryTasks.length,
  };

  /* ── Initialize retry queue ── */
  useEffect(() => {
    retryQueueRef.current = new ClientRetryQueue(
      async (chunkId: string) => {
        const success = await uploadChunk(chunkId);
        if (success) {
          setChunks((prev) =>
            prev.map((c) =>
              c.chunkId === chunkId ? { ...c, state: "uploaded" } : c
            )
          );
        }
        return success;
      },
      (tasks) => setRetryTasks([...tasks])
    );

    return () => {
      retryQueueRef.current?.clear();
    };
  }, []);

  /* ── STEP 5: Recovery on page load ── */
  useEffect(() => {
    async function recover() {
      try {
        const storedIds = await opfs.listChunks();
        if (storedIds.length === 0) return;

        setRecovering(true);
        setRecoveredCount(storedIds.length);

        // Re-create chunk status entries for orphaned OPFS chunks
        const recoveryChunks: ChunkStatus[] = storedIds.map((id) => ({
          chunkId: id,
          state: "saved" as const,
        }));

        setChunks((prev) => {
          const existingIds = new Set(prev.map((c) => c.chunkId));
          const newChunks = recoveryChunks.filter(
            (c) => !existingIds.has(c.chunkId)
          );
          return [...prev, ...newChunks];
        });

        // Re-upload each orphaned chunk
        for (const id of storedIds) {
          await doUpload(id);
        }
      } catch (err) {
        console.error("[recovery] Failed:", err);
      } finally {
        setRecovering(false);
      }
    }

    recover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Upload a single chunk ── */
  const doUpload = useCallback(
    async (chunkId: string) => {
      setChunks((prev) =>
        prev.map((c) =>
          c.chunkId === chunkId ? { ...c, state: "uploading" } : c
        )
      );

      try {
        const success = await uploadChunk(chunkId);
        if (success) {
          setChunks((prev) =>
            prev.map((c) =>
              c.chunkId === chunkId ? { ...c, state: "uploaded" } : c
            )
          );
        } else {
          throw new Error("Upload returned false");
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        setChunks((prev) =>
          prev.map((c) =>
            c.chunkId === chunkId ? { ...c, state: "failed", error } : c
          )
        );

        // Enqueue for retry
        retryQueueRef.current?.enqueue(chunkId);
      }
    },
    []
  );

  /* ── Start Recording ── */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size === 0) return;

        const chunkId = crypto.randomUUID();
        const blob = event.data;
        chunkIndexRef.current += 1;

        // Add to UI immediately
        setChunks((prev) => [
          ...prev,
          { chunkId, state: "recording" },
        ]);

        // Save to OPFS first (persist before upload)
        try {
          await opfs.saveChunk(chunkId, blob);
          setChunks((prev) =>
            prev.map((c) =>
              c.chunkId === chunkId ? { ...c, state: "saved" } : c
            )
          );

          // Then upload
          doUpload(chunkId);
        } catch (err) {
          console.error("[record] Failed to save to OPFS:", err);
          setChunks((prev) =>
            prev.map((c) =>
              c.chunkId === chunkId
                ? {
                    ...c,
                    state: "failed",
                    error: "OPFS save failed",
                  }
                : c
            )
          );
        }
      };

      // Split into 1-second chunks
      mediaRecorder.start(1000);

      setIsRecording(true);
      startTimeRef.current = Date.now();
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 200);
    } catch (err) {
      console.error("[record] Failed to start recording:", err);
    }
  }, [doUpload]);

  /* ── Stop Recording ── */
  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    mediaRecorderRef.current = null;
    streamRef.current = null;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsRecording(false);
  }, []);

  /* ── Manual Recovery ── */
  const handleManualRecovery = useCallback(async () => {
    setManualRecovering(true);
    setRecoveryLog([]);
    let recovered = 0;

    try {
      const storedIds = await opfs.listChunks();

      if (storedIds.length === 0) {
        toast.info("No chunks found in OPFS — nothing to recover.");
        setManualRecovering(false);
        return;
      }

      setRecoveryLog((prev) => [...prev, `Found ${storedIds.length} chunk(s) in OPFS`]);

      // Add any missing entries to the chunk list
      setChunks((prev) => {
        const existingIds = new Set(prev.map((c) => c.chunkId));
        const newChunks: ChunkStatus[] = storedIds
          .filter((id) => !existingIds.has(id))
          .map((id) => ({ chunkId: id, state: "saved" as const }));
        return [...prev, ...newChunks];
      });

      // Re-upload each chunk
      for (const chunkId of storedIds) {
        setRecoveryLog((prev) => [...prev, `Recovered chunk: ${chunkId}`]);
        console.log(`[recovery] Recovered chunk: ${chunkId}`);
        await doUpload(chunkId);
        recovered++;
      }

      setRecoveredCount((prev) => prev + recovered);
      toast.success(`Recovery completed — ${recovered} chunk(s) re-uploaded.`);
    } catch (err) {
      console.error("[recovery] Manual recovery failed:", err);
      toast.error("Recovery failed. Check console for details.");
    } finally {
      setManualRecovering(false);
    }
  }, [doUpload]);

  /* ── Cleanup on unmount ── */
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* ── Render ── */
  return (
    <div className="container mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      {/* Recovery Banner */}
      {recovering && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <RefreshCw className="size-4 animate-spin" />
          <span>
            Recovering {recoveredCount} chunk(s) from previous session...
          </span>
        </div>
      )}

      {/* ── Recording Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="size-5" />
            Audio Recorder
          </CardTitle>
          <CardDescription>
            Records microphone input in 1-second chunks · OPFS-backed · Auto-upload
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {/* Timer */}
          <div className="flex items-center justify-center">
            <div className="relative">
              <div className="font-mono text-5xl font-light tabular-nums tracking-tight">
                {formatTime(elapsed)}
              </div>
              {isRecording && (
                <span className="absolute -right-4 top-0 size-3 rounded-full bg-red-500 animate-pulse" />
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {!isRecording ? (
              <Button
                id="btn-start-recording"
                size="lg"
                className="gap-2 px-8"
                onClick={startRecording}
              >
                <Mic className="size-5" />
                Start Recording
              </Button>
            ) : (
              <Button
                id="btn-stop-recording"
                size="lg"
                variant="destructive"
                className="gap-2 px-8"
                onClick={stopRecording}
              >
                <Square className="size-5" />
                Stop Recording
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Status Dashboard ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-5" />
            Upload Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <StatBox
              label="Recorded"
              value={stats.recorded}
              icon={<Mic className="size-4 text-blue-400" />}
            />
            <StatBox
              label="Uploaded"
              value={stats.uploaded}
              icon={<CheckCircle2 className="size-4 text-emerald-400" />}
            />
            <StatBox
              label="Failed"
              value={stats.failed}
              icon={<XCircle className="size-4 text-red-400" />}
            />
            <StatBox
              label="Retrying"
              value={stats.retrying}
              icon={<RefreshCw className="size-4 text-amber-400" />}
            />
            <StatBox
              label="Recovered"
              value={recoveredCount}
              icon={<ShieldCheck className="size-4 text-violet-400" />}
            />
            <StatBox
              label="Pending"
              value={stats.pending}
              icon={<Loader2 className="size-4 text-slate-400" />}
            />
          </div>

          {/* Progress Bar */}
          {stats.recorded > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Upload progress</span>
                <span>
                  {stats.uploaded}/{stats.recorded}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                  style={{
                    width: `${(stats.uploaded / stats.recorded) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Manual Recovery ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DownloadCloud className="size-5" />
            Recovery
          </CardTitle>
          <CardDescription>
            Scan OPFS for orphaned chunks and re-upload them
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button
            id="btn-recover-chunks"
            variant="outline"
            className="gap-2 self-start"
            onClick={handleManualRecovery}
            disabled={manualRecovering || isRecording}
          >
            {manualRecovering ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Recovering...
              </>
            ) : (
              <>
                <ShieldCheck className="size-4" />
                Recover Missing Chunks
              </>
            )}
          </Button>

          {/* Recovery Log */}
          {recoveryLog.length > 0 && (
            <div className="max-h-[160px] overflow-y-auto rounded-md border border-border/30 bg-muted/10 p-3">
              <div className="flex flex-col gap-1">
                {recoveryLog.map((log, i) => (
                  <span key={i} className="text-xs font-mono text-muted-foreground">
                    <span className="text-emerald-400 mr-1">▸</span>{log}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Chunk List ── */}
      {chunks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="size-5" />
              Chunks
            </CardTitle>
            <CardDescription>
              {chunks.length} chunk(s) — stored in OPFS until upload is confirmed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1.5 max-h-[400px] overflow-y-auto">
              {chunks.map((chunk, i) => (
                <ChunkRow key={chunk.chunkId} chunk={chunk} index={i} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────────────────── */

function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border/50 bg-muted/20 px-3 py-3">
      {icon}
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function ChunkRow({ chunk, index }: { chunk: ChunkStatus; index: number }) {
  const stateConfig = {
    recording: {
      icon: <Mic className="size-3.5 text-blue-400 animate-pulse" />,
      label: "Recording",
      color: "text-blue-400",
    },
    saved: {
      icon: <HardDrive className="size-3.5 text-slate-400" />,
      label: "Saved (OPFS)",
      color: "text-slate-400",
    },
    uploading: {
      icon: <Loader2 className="size-3.5 text-amber-400 animate-spin" />,
      label: "Uploading...",
      color: "text-amber-400",
    },
    uploaded: {
      icon: <Wifi className="size-3.5 text-emerald-400" />,
      label: "Uploaded ✓",
      color: "text-emerald-400",
    },
    failed: {
      icon: <WifiOff className="size-3.5 text-red-400" />,
      label: "Failed",
      color: "text-red-400",
    },
  };

  const cfg = stateConfig[chunk.state];

  return (
    <div className="flex items-center gap-3 rounded-md border border-border/30 bg-muted/10 px-3 py-2 text-sm">
      <span className="w-6 text-center text-xs font-mono text-muted-foreground">
        {index + 1}
      </span>
      {cfg.icon}
      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
      <span className="ml-auto text-[10px] font-mono text-muted-foreground truncate max-w-[180px]">
        {chunk.chunkId.slice(0, 8)}…
      </span>
      {chunk.error && (
        <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={chunk.error}>
          {chunk.error}
        </span>
      )}
    </div>
  );
}
