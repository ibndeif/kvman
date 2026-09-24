import type { Admission, CommitResult, CommitUnit } from './commit-unit.ts';
import { correlationOf } from './commit-unit.ts';
import { StorageFailure, type Connection } from './driver.ts';
import { applyUnit, storageProblem } from './unit-application.ts';

export type CommitPipelineOptions = {
  connection: Connection;
  admission: Admission;
  now: () => number;
  maxBatchUnits?: number;
  maxBatchDelayMs?: number;
};

type QueuedUnit = { unit: CommitUnit; resolve: (result: CommitResult) => void; reject: (error: unknown) => void };

export class CommitPipeline {
  readonly #connection: Connection;
  readonly #admission: Admission;
  readonly #now: () => number;
  readonly #maxBatchUnits: number;
  readonly #maxBatchDelayMs: number;
  #queue: QueuedUnit[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: CommitPipelineOptions) {
    this.#connection = options.connection;
    this.#admission = options.admission;
    this.#now = options.now;
    this.#maxBatchUnits = options.maxBatchUnits ?? 64;
    this.#maxBatchDelayMs = options.maxBatchDelayMs ?? 2;
  }

  enqueue(unit: CommitUnit): Promise<CommitResult> {
    return new Promise((resolve, reject) => {
      this.#queue.push({ unit, resolve, reject });
      if (this.#queue.length >= this.#maxBatchUnits) this.flush();
      else this.#timer ??= setTimeout(() => this.flush(), this.#maxBatchDelayMs);
    });
  }

  flush(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    while (this.#queue.length > 0) this.#commitBatch(this.#queue.splice(0, this.#maxBatchUnits));
  }

  #commitBatch(batch: QueuedUnit[]): void {
    const now = this.#now();
    try {
      this.#connection.exec('BEGIN IMMEDIATE');
      const outcomes = batch.map((queued) => ({ queued, result: applyUnit(this.#connection, queued.unit, this.#admission, now) }));
      this.#connection.exec('COMMIT');
      for (const { queued, result } of outcomes) queued.resolve(result);
    } catch (error) {
      this.#endFailedBatch(batch, error);
    }
  }

  // The transaction is rolled back before any waiter learns the outcome; a failure that is not a storage failure
  // is a bug, and every waiter of the batch receives it instead of a result.
  #endFailedBatch(batch: QueuedUnit[], error: unknown): void {
    if (this.#connection.inTransaction()) this.#connection.exec('ROLLBACK');
    for (const { unit, resolve, reject } of batch) {
      if (error instanceof StorageFailure) resolve({ committed: false, problem: storageProblem(error, correlationOf(unit.origin)) });
      else reject(error);
    }
  }
}
