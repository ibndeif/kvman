import { inertFaults, type FaultPoints } from '../faults/fault-points.ts';
import type { Admission, AppliedMessages, CommitResult, CommitUnit } from './commit-unit.ts';
import { correlationOf } from './commit-unit.ts';
import { StorageFailure, type Connection } from './driver.ts';
import { applyUnit, storageProblem } from './unit-application.ts';

export type CommitPipelineOptions = {
  connection: Connection;
  admission: Admission;
  now: () => number;
  maxBatchUnits?: number;
  faults?: FaultPoints;
};

// Where a batch's stored messages go (03 §3.4): the sink hears of them inside the batch's transaction, so the
// scheduler can claim the runnable ones in that same transaction (ADR 0105), then whether the batch committed.
export interface PendingSink {
  enterBatch(applied: readonly AppliedMessages[]): void;
  batchCommitted(): void;
  batchRolledBack(): void;
}

type QueuedUnit = { unit: CommitUnit; resolve: (result: CommitResult) => void; reject: (error: unknown) => void };

// Told about every unit that commits, after the transaction and before its sender learns the result.
export type CommitListener = (applied: AppliedMessages) => void;

// 04 §4.2 and ADR 0105: group commit. Units wait for the end of the current event-loop turn, or for 64 of them,
// and commit in one transaction with one savepoint each; while a commit blocks the thread, the next batch gathers.
export class CommitPipeline {
  readonly #connection: Connection;
  readonly #admission: Admission;
  readonly #now: () => number;
  readonly #maxBatchUnits: number;
  readonly #faults: FaultPoints;
  readonly #listeners = new Set<CommitListener>();
  #sink: PendingSink | undefined;
  #queue: QueuedUnit[] = [];
  #flush: ReturnType<typeof setImmediate> | undefined;

  constructor(options: CommitPipelineOptions) {
    this.#connection = options.connection;
    this.#admission = options.admission;
    this.#now = options.now;
    this.#maxBatchUnits = options.maxBatchUnits ?? 64;
    this.#faults = options.faults ?? inertFaults;
  }

  // The scheduler (or, without one, the pending index) that takes the stored messages of every batch.
  attach(sink: PendingSink): void {
    this.#sink = sink;
  }

  observe(listener: CommitListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  enqueue(unit: CommitUnit): Promise<CommitResult> {
    return new Promise((resolve, reject) => {
      this.#queue.push({ unit, resolve, reject });
      if (this.#queue.length >= this.#maxBatchUnits) this.flush();
      else this.#flush ??= setImmediate(() => this.flush());
    });
  }

  flush(): void {
    if (this.#flush !== undefined) clearImmediate(this.#flush);
    this.#flush = undefined;
    while (this.#queue.length > 0) this.#commitBatch(this.#queue.splice(0, this.#maxBatchUnits));
  }

  #commitBatch(batch: QueuedUnit[]): void {
    const outcomes = this.#applyBatch(batch);
    if (outcomes === undefined) return;
    const committed = outcomes.flatMap(({ queued, result }) => (result.committed ? [{ unit: queued.unit, result }] : []));
    for (const { unit } of committed) this.#reachCommitted(unit);
    this.#sink?.batchCommitted();
    for (const { result } of committed) for (const listener of this.#listeners) listener(result);
    for (const { queued, result } of outcomes) queued.resolve(result);
  }

  #applyBatch(batch: QueuedUnit[]): Array<{ queued: QueuedUnit; result: CommitResult }> | undefined {
    const now = this.#now();
    try {
      this.#connection.exec('BEGIN IMMEDIATE');
      const outcomes = batch.map((queued) => ({ queued, result: applyUnit(this.#connection, queued.unit, this.#admission, now) }));
      const applied = outcomes.flatMap(({ queued, result }) => (result.committed ? [{ unit: queued.unit, result }] : []));
      for (const { unit } of applied) this.#reachApplied(unit);
      this.#sink?.enterBatch(applied.map(({ result }) => result));
      this.#connection.exec('COMMIT');
      return outcomes;
    } catch (error) {
      this.#endFailedBatch(batch, error);
      return undefined;
    }
  }

  // ADR 0100: the fault points around COMMIT, once per unit of the batch that commits.
  #reachApplied(unit: CommitUnit): void {
    if (unit.origin.kind === 'adapter') this.#faults.reach('admit.before-commit');
    if (unit.origin.kind !== 'invocation') return;
    this.#faults.reach('uow.before-commit');
    if (unit.replies.length > 0) this.#faults.reach('defer.before-reply');
  }

  #reachCommitted(unit: CommitUnit): void {
    if (unit.origin.kind === 'adapter') this.#faults.reach('admit.after-commit');
    if (unit.origin.kind === 'invocation') this.#faults.reach('uow.after-commit-before-notify');
  }

  // The transaction is rolled back before any waiter learns the outcome; a failure that is not a storage failure
  // is a bug, and every waiter of the batch receives it instead of a result.
  #endFailedBatch(batch: QueuedUnit[], error: unknown): void {
    if (this.#connection.inTransaction()) this.#connection.exec('ROLLBACK');
    this.#sink?.batchRolledBack();
    for (const { unit, resolve, reject } of batch) {
      if (error instanceof StorageFailure) resolve({ committed: false, problem: storageProblem(error, correlationOf(unit.origin)), stale: false });
      else reject(error);
    }
  }
}
