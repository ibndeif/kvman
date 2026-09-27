import type { CompleteFrame, HostOutcome, NewRecordedValues, Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { Admission, CommitResult, CommitUnit } from '../storage/commit-unit.ts';
import type { LiveAddress, LiveBus } from './live-bus.ts';
import type { QueryPath } from './query-path.ts';
import type { Quarantines } from './quarantines.ts';
import type { RecordedValueStore } from './recorded-value-store.ts';
import type { ReplyWaiters } from './reply-waiters.ts';

export type SettlementDeps = {
  pipeline: CommitPipeline;
  scheduler: Scheduler;
  waiters: ReplyWaiters;
  queries: QueryPath;
  live: LiveBus;
  values: RecordedValueStore;
  quarantines: Quarantines;
  // ADR 0134: a query result may name only blobs its handler may read.
  results: Pick<Admission, 'checkResult'>;
  // 04 §4.6: an attempt's open uploads, and without a commit its pending blob references, end with it.
  blobs: { ended(messageId: string, committed: boolean): Promise<void> };
  // 03 §3.7: the processes of the invocation that are not detached end with it.
  processes: { invocationEnded(invocationId: string): void };
};

// `id` is the invocation's; a claim that never reached a host has none.
type Run = { id?: string; claim: Claim; live: ReadonlyMap<string, LiveAddress>; received?: ReadonlySet<string> };

const noNewValues: NewRecordedValues = { id: [], now: [] };

type EmptyContents = Omit<CommitUnit, 'origin'>;
const emptyContents: EmptyContents = { writes: [], sends: [], publishes: [], replies: [] };

// How an invocation ends (02 §2.12, 04 §4.2): a result or a deferral commits its unit; a failure or a unit that
// does not commit resets the run's live events (02 §2.3), then retries, fails, or drops the message.
export class Settlement {
  readonly #deps: SettlementDeps;

  constructor(deps: SettlementDeps) {
    this.#deps = deps;
  }

  async completed(run: Run, frame: CompleteFrame): Promise<void> {
    this.#ended(run);
    const { claim } = run;
    if (claim.message.kind === 'query') {
      this.#answerQuery(run, frame.outcome);
      return;
    }
    const { outcome } = frame;
    if ('ok' in outcome && !outcome.ok) {
      await this.#failed(run, outcome.problem, frame.recorded);
      return;
    }
    const result = await this.#commit(run, outcome, frame.unitOfWork, true);
    if (result.committed) {
      await this.#deps.blobs.ended(claim.message.id, true);
      this.#deps.scheduler.settled(claim.message.id);
      this.#deps.waiters.resolve(result.replies);
      const { deadlineAt } = claim.message;
      if ('deferred' in outcome && claim.stored && deadlineAt !== undefined) this.#deps.scheduler.watchAwaiting(claim.message.id, deadlineAt);
      if ('deferred' in outcome) this.#deps.waiters.deferred(claim.message.id);
      return;
    }
    if (!result.stale) await this.#notCommitted(run, result.problem, frame.recorded);
  }

  // ADR 0084: the invocation deadline ended the attempt; the handler's later result is discarded by the host manager.
  async timedOut(run: Run, reason: 'deadline' | 'timeout'): Promise<void> {
    this.#ended(run);
    const { message } = run.claim;
    const code = reason === 'deadline' ? 'DEADLINE_EXCEEDED' : message.kind === 'query' ? 'QUERY_TIMEOUT' : 'HANDLER_TIMEOUT';
    const problem = kernelProblem(code, { correlationId: message.correlationId, messageId: message.id });
    if (message.kind === 'query') {
      await this.#reset(run);
      this.#deps.queries.answer(message.id, { ok: false, problem });
      return;
    }
    await this.#failed(run, problem, noNewValues);
  }

  // A cancel already ended the message in its own unit (ADR 0083); only the preview is withdrawn.
  async aborted(run: Run): Promise<void> {
    this.#ended(run);
    await this.#reset(run);
  }

  // 03 §3.6: caught on a stuck host through no fault of its own, it returns without an attempt penalty.
  async collateral(run: Run): Promise<void> {
    this.#ended(run);
    await this.#reset(run);
    const { message, extension } = run.claim;
    if (message.kind === 'query') {
      this.#deps.scheduler.submitQuery({ message, handler: extension });
      return;
    }
    await this.#deps.scheduler.redeliver(message.id);
  }

  // 03 §3.9, ADR 0091: shutdown ended the attempt; it returns to pending without an attempt and runs at the next boot.
  // Its processes are left to the supervisor's stop, which kills every group and leaves the rows to boot (ADR 0139).
  async interrupted(run: Run): Promise<void> {
    await this.#reset(run);
    const { message } = run.claim;
    if (message.kind === 'query') {
      this.#deps.queries.answer(message.id, { ok: false, problem: kernelProblem('KERNEL_STOPPING', { correlationId: message.correlationId, messageId: message.id }) });
      return;
    }
    await this.#deps.scheduler.redeliver(message.id);
  }

  // ADRs 0071, 0081: the extension could not be loaded; drift quarantines it.
  async loadFailed(run: Run, problem: Problem): Promise<void> {
    this.#ended(run);
    const { message, extension } = run.claim;
    if (message.kind === 'query') this.#deps.queries.answer(message.id, { ok: false, problem });
    else await this.#failed(run, { ...problem, retryable: false }, noNewValues);
    if (problem.code === 'EXT_MANIFEST_INVALID') await this.#deps.quarantines.quarantine(extension, 'EXT_MANIFEST_INVALID');
  }

  // A host lost with the invocation in it (ADR 0067): a retryable INTERNAL.
  async lost(run: Run): Promise<void> {
    this.#ended(run);
    const { message } = run.claim;
    const problem = kernelProblem('INTERNAL', { correlationId: message.correlationId, messageId: message.id, detail: 'the host running the handler exited' });
    if (message.kind === 'query') {
      this.#deps.queries.answer(message.id, { ok: false, problem });
      return;
    }
    await this.#failed(run, problem, noNewValues);
  }

  // The invocation could not be sent to a host at all (ADR 0075): a final failure.
  async refused(claim: Claim, problem: Problem): Promise<void> {
    if (claim.message.kind === 'query') {
      this.#deps.queries.answer(claim.message.id, { ok: false, problem });
      return;
    }
    await this.#failed({ claim, live: new Map() }, problem, noNewValues);
  }

  #answerQuery({ claim, received }: Run, outcome: HostOutcome): void {
    if ('ok' in outcome && outcome.ok) {
      const problem = this.#deps.results.checkResult({ message: claim.message, value: outcome.value, extension: claim.extension, received: received ?? new Set() });
      if (problem !== undefined) {
        this.#deps.queries.answer(claim.message.id, { ok: false, problem });
        return;
      }
    }
    if ('deferred' in outcome) {
      const problem = kernelProblem('INTERNAL', { correlationId: claim.message.correlationId, detail: 'a query cannot defer' });
      this.#deps.queries.answer(claim.message.id, { ok: false, problem });
      return;
    }
    this.#deps.queries.answer(claim.message.id, outcome.ok ? { ok: true, value: outcome.value } : { ok: false, problem: outcome.problem });
  }

  // The handler's own unit is checked against its invocation deadline (04 §4.2); a failure the kernel records is not.
  #commit({ claim, received }: Run, outcome: HostOutcome, contents: EmptyContents, handlerUnit: boolean): Promise<CommitResult> {
    const invocation = {
      message: claim.message, extension: claim.extension, outcome, stored: claim.stored,
      ...(handlerUnit ? { deadlineAt: claim.deadlineAt } : {}), ...(received === undefined ? {} : { received }),
    };
    return this.#deps.pipeline.enqueue({ origin: { kind: 'invocation', invocation }, ...contents });
  }

  async #notCommitted(run: Run, problem: Problem, recorded: NewRecordedValues): Promise<void> {
    if (problem.code !== 'STORAGE_CONFLICT') {
      await this.#failed(run, problem, recorded);
      return;
    }
    await this.#reset(run);
    if (!run.claim.stored) {
      this.#deps.scheduler.dropped(run.claim.message.id);
      return;
    }
    const conflict = await this.#deps.scheduler.conflicted(run.claim.message.id);
    if (!conflict.rerun) this.#resolveWaiters(conflict.result);
  }

  async #failed(run: Run, problem: Problem, recorded: NewRecordedValues): Promise<void> {
    await this.#reset(run);
    const { claim } = run;
    if (!claim.stored) {
      this.#deps.scheduler.dropped(claim.message.id);
      return;
    }
    if (!problem.retryable) {
      await this.#failFinal(run, problem);
      return;
    }
    this.#deps.values.append(claim.message.id, recorded);
    this.#resolveWaiters(await this.#deps.scheduler.failed(claim.message.id, problem));
  }

  async #failFinal(run: Run, problem: Problem): Promise<void> {
    const result = await this.#commit(run, { ok: false, problem }, emptyContents, false);
    if (!result.committed && result.stale) return;
    this.#deps.scheduler.settled(run.claim.message.id);
    this.#resolveWaiters(result);
  }

  #resolveWaiters(result: CommitResult): void {
    if (result.committed) this.#deps.waiters.resolve(result.replies);
  }

  #ended(run: Run): void {
    if (run.id !== undefined) this.#deps.processes.invocationEnded(run.id);
  }

  async #reset({ claim, live }: Run): Promise<void> {
    if (live.size > 0) this.#deps.live.reset(claim.message.id, live.values());
    await this.#deps.blobs.ended(claim.message.id, false);
  }
}
