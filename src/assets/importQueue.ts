import type { ImportCandidate } from './ingest.ts';

export type ImportQueueStatus = 'queued' | 'processing' | 'ready' | 'error' | 'cancelled';

export interface ImportQueueItem<Result> {
  id: string;
  index: number;
  candidate: ImportCandidate;
  status: ImportQueueStatus;
  result?: Result;
  error?: string;
}

export interface ImportProgress<Result> {
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  active: number;
  items: ReadonlyArray<ImportQueueItem<Result>>;
}

export interface ImportSummary<Result> extends ImportProgress<Result> {
  startedAt: number;
  finishedAt: number;
}

export type ImportProcessor<Result> = (
  candidate: ImportCandidate,
  index: number,
  signal: AbortSignal
) => Promise<Result>;

export interface ImportQueueOptions<Result> {
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress<Result>) => void;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function snapshot<Result>(items: ImportQueueItem<Result>[]): ImportProgress<Result> {
  const succeeded = items.filter((item) => item.status === 'ready').length;
  const failed = items.filter((item) => item.status === 'error').length;
  const cancelled = items.filter((item) => item.status === 'cancelled').length;
  const active = items.filter((item) => item.status === 'processing').length;
  return {
    total: items.length,
    completed: succeeded + failed + cancelled,
    succeeded,
    failed,
    cancelled,
    active,
    items: items.map((item) => ({ ...item }))
  };
}

export class ImportQueue<Result> {
  private running = false;
  private items: ImportQueueItem<Result>[] = [];
  private readonly processor: ImportProcessor<Result>;

  constructor(processor: ImportProcessor<Result>) {
    this.processor = processor;
  }

  getSnapshot() {
    return snapshot(this.items);
  }

  async run(candidates: ImportCandidate[], options: ImportQueueOptions<Result> = {}): Promise<ImportSummary<Result>> {
    if (this.running) throw new Error('Import queue is already running');
    const concurrency = options.concurrency ?? 3;
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
      throw new Error('Import queue concurrency must be an integer from 1 to 16');
    }

    this.running = true;
    this.items = candidates.map((candidate, index) => ({
      id: crypto.randomUUID(),
      index,
      candidate,
      status: 'queued'
    }));
    const startedAt = Date.now();
    let cursor = 0;

    const emitProgress = () => options.onProgress?.(snapshot(this.items));
    emitProgress();

    const worker = async () => {
      while (cursor < this.items.length) {
        if (options.signal?.aborted) return;
        const itemIndex = cursor;
        cursor += 1;
        const item = this.items[itemIndex];
        item.status = 'processing';
        emitProgress();
        try {
          item.result = await this.processor(item.candidate, item.index, options.signal ?? new AbortController().signal);
          item.status = 'ready';
        } catch (error) {
          item.error = errorMessage(error);
          item.status = options.signal?.aborted ? 'cancelled' : 'error';
        }
        emitProgress();
      }
    };

    try {
      const workerCount = Math.min(concurrency, Math.max(this.items.length, 1));
      await Promise.all(Array.from({ length: workerCount }, worker));
      if (options.signal?.aborted) {
        for (const item of this.items) {
          if (item.status === 'queued') item.status = 'cancelled';
        }
        emitProgress();
      }
      return {
        ...snapshot(this.items),
        startedAt,
        finishedAt: Date.now()
      };
    } finally {
      this.running = false;
    }
  }
}
