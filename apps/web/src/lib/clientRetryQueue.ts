/**
 * Client Retry Queue — Exponential backoff retry for failed uploads.
 *
 * Retry delays: 1s, 2s, 4s, 8s, 16s (max 5 attempts)
 */

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export interface RetryTask {
  chunkId: string;
  attempt: number;
  maxAttempts: number;
  lastError?: string;
}

type RetryExecutor = (chunkId: string) => Promise<boolean>;

interface QueueEntry {
  task: RetryTask;
  timer: ReturnType<typeof setTimeout> | null;
}

function getDelay(attempt: number): number {
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

export class ClientRetryQueue {
  private queue = new Map<string, QueueEntry>();
  private executor: RetryExecutor;
  private onUpdate: (tasks: RetryTask[]) => void;

  constructor(executor: RetryExecutor, onUpdate: (tasks: RetryTask[]) => void) {
    this.executor = executor;
    this.onUpdate = onUpdate;
  }

  /** Enqueue a failed chunk for retry */
  enqueue(chunkId: string): void {
    if (this.queue.has(chunkId)) return;

    const task: RetryTask = {
      chunkId,
      attempt: 0,
      maxAttempts: MAX_RETRIES,
    };

    const entry: QueueEntry = { task, timer: null };
    this.queue.set(chunkId, entry);
    this.scheduleRetry(entry);
    this.notifyUpdate();
  }

  private scheduleRetry(entry: QueueEntry): void {
    const delay = getDelay(entry.task.attempt);
    entry.timer = setTimeout(() => this.executeRetry(entry), delay);
  }

  private async executeRetry(entry: QueueEntry): Promise<void> {
    const { task } = entry;

    try {
      const success = await this.executor(task.chunkId);
      if (success) {
        this.queue.delete(task.chunkId);
        this.notifyUpdate();
        return;
      }
    } catch (err) {
      task.lastError = err instanceof Error ? err.message : String(err);
    }

    task.attempt += 1;

    if (task.attempt >= task.maxAttempts) {
      // Mark as permanently failed, keep in queue for visibility
      task.lastError = `Failed after ${task.maxAttempts} attempts`;
      this.notifyUpdate();
      return;
    }

    this.scheduleRetry(entry);
    this.notifyUpdate();
  }

  /** Get all active retry tasks */
  getTasks(): RetryTask[] {
    return Array.from(this.queue.values()).map((e) => ({ ...e.task }));
  }

  /** Check if a chunk is currently in the retry queue */
  has(chunkId: string): boolean {
    return this.queue.has(chunkId);
  }

  /** Remove a chunk from the retry queue (e.g., on manual cancel) */
  cancel(chunkId: string): void {
    const entry = this.queue.get(chunkId);
    if (entry?.timer) clearTimeout(entry.timer);
    this.queue.delete(chunkId);
    this.notifyUpdate();
  }

  /** Cancel all pending retries */
  clear(): void {
    for (const [, entry] of this.queue) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.queue.clear();
    this.notifyUpdate();
  }

  /** Number of items in the retry queue */
  get size(): number {
    return this.queue.size;
  }

  private notifyUpdate(): void {
    this.onUpdate(this.getTasks());
  }
}
