import { ProblemError, type Job, type Problem, type Workspace } from '@kvman/sdk';
import type { CancelTimer, Clock } from '../clock.ts';
import type { KernelLogger } from '../logging/logger.ts';
import { kernelProblem } from '../problems.ts';
import type { ScheduleRows } from '../schedules/schedule-rows.ts';
import type { Connection } from '../storage/database.ts';
import type { SyncEnd } from '../workers/protocol.ts';
import type { WorkerPool } from '../workers/pool.ts';
import type { HandlerSummary } from './handlers.ts';
import type { ClaimedJob, JobRows, NewJob } from './job-rows.ts';
import { backoffMs, isRetried } from './retry-policy.ts';

// The main thread's loop over async and scheduled jobs (plan 02 §2.1, §2.3, §2.4, §2.15): it queues due schedules,
// starts due jobs first-in, first-out while the pool has room, records each attempt's end, retries with backoff, and
// queues the kernel's handler jobs in the transaction that records the end.

export type DispatcherMode = 'running' | 'stopping' | 'stopped';

export type DispatcherOptions = {
  connection: Connection;
  rows: JobRows;
  schedules: ScheduleRows;
  clock: Clock;
  logger: KernelLogger;
  workspaceOf: (id: string) => Workspace;
};

type Outcome = { output: unknown } | { problem: Problem };

export type Dispatcher = ReturnType<typeof createDispatcher>;

// Queues one handler job per handler registered for a point, in the caller's transaction.
export type Deliver = (point: string, input: Record<string, unknown>, workspaceId: string) => void;

export function createDispatcher(options: DispatcherOptions) {
  const { connection, rows, schedules, clock } = options;
  let pool: WorkerPool | undefined;
  let handlers: readonly HandlerSummary[] = [];
  let mode: DispatcherMode = 'running';
  let timer: CancelTimer | undefined;
  // Set when due jobs may be waiting for a free slot, so a slot freed by a sync job only wakes the loop then.
  let waitingForSlot = false;
  const attempts = new Map<string, Promise<void>>();
  const endWaiters = new Map<string, ((job: Job) => void)[]>();
  let settleWaiters: (() => void)[] = [];

  const deliver = (point: string, input: Record<string, unknown>, workspaceId: string, onlyExtension?: string): string[] =>
    handlers
      .filter((handler) => handler.point === point && (onlyExtension === undefined || handler.extension === onlyExtension))
      .map((handler) =>
        rows.insert({ name: point, input, workspaceId, caller: { kind: 'kernel' }, retries: handler.retries, fromHandler: true, handlerExtension: handler.extension, runAt: clock.now() }),
      );

  const ended = (id: string): void => {
    const job = rows.get(id);
    if (job === undefined || job.endedAt === undefined) return;
    for (const resolve of endWaiters.get(id) ?? []) resolve(job);
    endWaiters.delete(id);
  };

  const base = (job: ClaimedJob) => ({ jobId: job.id, rootId: job.id, name: job.name, caller: job.caller, workspaceId: job.workspaceId });

  const record = (job: ClaimedJob, outcome: Outcome): void => {
    const deliverFor = (point: string, extra: Record<string, unknown>): void => {
      if (!job.fromHandler) deliver(point, { ...base(job), ...extra }, job.workspaceId);
    };
    connection.transaction(() => {
      if ('output' in outcome) {
        rows.succeed(job.id, outcome.output);
        deliverFor('kernel.job.succeeded', {});
      } else if (outcome.problem.code === 'CANCELLED') {
        rows.cancel(job.id);
        deliverFor('kernel.job.cancelled', { reason: 'cancel' });
      } else if (isRetried(outcome.problem) && job.attempts <= job.retries && !(job.name === 'kernel.stopping' && job.handlerExtension !== undefined)) {
        rows.requeue(job.id, outcome.problem, clock.now() + backoffMs(job.attempts));
      } else {
        rows.fail(job.id, outcome.problem);
        deliverFor('kernel.job.failed', { problem: outcome.problem, attempts: job.attempts });
      }
    })();
    ended(job.id);
  };

  const dispatch = (active: WorkerPool, job: ClaimedJob): void => {
    const run = async (): Promise<Outcome> => {
      try {
        const workspace = options.workspaceOf(job.workspaceId);
        const root = { id: job.id, name: job.name, input: job.input, workspace, caller: job.caller, async: true, fromHandler: job.fromHandler };
        return { output: await active.run(job.handlerExtension === undefined ? root : { ...root, handlerExtension: job.handlerExtension }) };
      } catch (error) {
        if (error instanceof ProblemError) return { problem: error.problem };
        throw error;
      }
    };
    attempts.set(
      job.id,
      run().then((outcome) => {
        record(job, outcome);
        attempts.delete(job.id);
        tick();
      }),
    );
  };

  const nextDue = (): number | undefined => {
    const times = [rows.earliestRunAt(), mode === 'running' ? schedules.earliestNextRun() : undefined].filter((time) => time !== undefined);
    return times.length === 0 ? undefined : Math.min(...times);
  };

  const checkSettled = (): void => {
    const due = nextDue();
    if (attempts.size > 0 || (due !== undefined && due <= clock.now() && mode !== 'stopped')) return;
    const waiters = settleWaiters;
    settleWaiters = [];
    for (const resolve of waiters) resolve();
  };

  const arm = (): void => {
    timer?.();
    timer = undefined;
    const due = nextDue();
    if (due !== undefined && due > clock.now() && mode !== 'stopped') timer = clock.setTimer(due - clock.now(), tick);
  };

  const tick = (): void => {
    const active = pool;
    if (active === undefined || mode === 'stopped') return;
    const scheduleDue = schedules.earliestNextRun();
    if (mode === 'running' && scheduleDue !== undefined && scheduleDue <= clock.now()) {
      connection.transaction(() => schedules.queueDue((job) => rows.insert(job)))();
    }
    const free = active.freeSlots();
    const claimed = free > 0 ? rows.claimDue(free, mode === 'stopping' ? 'kernel.stopping' : undefined) : [];
    for (const job of claimed) dispatch(active, job);
    const due = rows.earliestRunAt();
    waitingForSlot = claimed.length === free && due !== undefined && due <= clock.now();
    arm();
    checkSettled();
  };

  return {
    attach(active: WorkerPool, summaries: readonly HandlerSummary[]): void {
      pool = active;
      handlers = summaries;
    },
    wake: tick,
    slotFreed(): void {
      if (waitingForSlot) tick();
    },
    setMode(next: DispatcherMode): void {
      mode = next;
      if (next === 'stopped') {
        timer?.();
        timer = undefined;
      }
      tick();
    },
    queue(job: NewJob): string {
      const id = rows.insert(job);
      tick();
      return id;
    },
    // For a job a handler queues: it starts on the next turn of the event loop, after the reply with its id has gone to
    // the worker, so a handler that reports the id (kvcoder's follow chunk) always does so before the new job runs.
    queueAfterReply(job: NewJob): string {
      const id = rows.insert(job);
      setImmediate(tick);
      return id;
    },
    deliver(point: string, input: Record<string, unknown>, workspaceId: string): string[] {
      const ids = connection.transaction(() => deliver(point, input, workspaceId))();
      tick();
      return ids;
    },
    deliverTo(point: string, extension: string, input: Record<string, unknown>, workspaceId: string): string[] {
      const ids = connection.transaction(() => deliver(point, input, workspaceId, extension))();
      tick();
      return ids;
    },
    // Runs `work` in one transaction with the handler jobs it delivers, then starts what is due.
    deliverAlong<Result>(work: (deliverIn: Deliver) => Result): Result {
      const result = connection.transaction(() => work((point, input, workspaceId) => void deliver(point, input, workspaceId)))();
      tick();
      return result;
    },
    deliverSyncEnd(end: SyncEnd): void {
      connection.transaction(() => deliver(end.point, end.input, end.workspaceId))();
      tick();
    },
    // Attempts left running by a stop or a crash end INTERRUPTED, and are retried like any failure (plan 02 §2.3).
    interruptLeftovers(): void {
      for (const job of rows.running()) record(job, { problem: kernelProblem('INTERRUPTED', 'kvman stopped during the attempt.').problem });
    },
    // A handler that never started before the end of shutdown is dropped (ADR 0009, 18).
    dropQueued(point: string): void {
      for (const job of rows.queuedHandlers(point)) record({ ...job, retries: 0 }, { problem: kernelProblem('INTERRUPTED', 'kvman stopped before the handler ran.').problem });
    },
    cancel(jobId: string): void {
      const job = rows.claimed(jobId);
      if (job === undefined) {
        if (pool?.abort(jobId, 'cancel') !== true) throw kernelProblem('NOT_FOUND', `There is no running job ${jobId}.`, { jobId });
        return;
      }
      const status = rows.get(jobId)?.status;
      if (status === 'queued') record(job, { problem: kernelProblem('CANCELLED', 'The job was cancelled.').problem });
      else if (status === 'running') pool?.abort(jobId, 'cancel');
    },
    waitForJob(id: string): Promise<Job> {
      const job = rows.get(id);
      if (job === undefined) return Promise.reject(kernelProblem('NOT_FOUND', `There is no job ${id}.`, { jobId: id }));
      if (job.endedAt !== undefined) return Promise.resolve(job);
      return new Promise((resolve) => endWaiters.set(id, [...(endWaiters.get(id) ?? []), resolve]));
    },
    settled(): Promise<void> {
      const done = new Promise<void>((resolve) => settleWaiters.push(resolve));
      checkSettled();
      return done;
    },
    running(): number {
      return attempts.size;
    },
    drained: async (): Promise<void> => {
      await Promise.all(attempts.values());
    },
  };
}
