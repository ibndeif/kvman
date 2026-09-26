import type { Json, Problem } from '@kvman/protocol';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { CommitResult, CommitUnit } from '../storage/commit-unit.ts';
import type { ReplyWaiters } from './reply-waiters.ts';

// ADR 0078: how a kernel command's unit commits, like any handler's: settled and its waiters answered when it
// commits, back to the scheduler when a retryable failure stops it.
export class KernelCommits {
  readonly #pipeline: CommitPipeline;
  readonly #scheduler: Scheduler;
  readonly #waiters: ReplyWaiters;

  constructor(pipeline: CommitPipeline, scheduler: Scheduler, waiters: ReplyWaiters) {
    this.#pipeline = pipeline;
    this.#scheduler = scheduler;
    this.#waiters = waiters;
  }

  async commit(unit: CommitUnit, claim: Claim): Promise<CommitResult> {
    const result = await this.#pipeline.enqueue(unit);
    if (result.committed) {
      this.#scheduler.settled(claim.message.id);
      this.#waiters.resolve(result.replies);
    } else if (!result.stale && result.problem.retryable) {
      await this.#scheduler.failed(claim.message.id, result.problem);
    } else if (!result.stale && unit.origin.kind !== 'invocation') {
      await this.fail(claim, result.problem);
    }
    return result;
  }

  // A kernel unit that settles no claim of its own, such as a forget's cancel: what it ends is answered.
  async commitUnclaimed(unit: CommitUnit): Promise<CommitResult> {
    const result = await this.#pipeline.enqueue(unit);
    if (result.committed) this.#waiters.resolve(result.replies);
    return result;
  }

  reply(claim: Claim, value: Json): Promise<CommitResult> {
    const invocation = { message: claim.message, extension: claim.extension, outcome: { ok: true, value } as const, stored: true };
    return this.commit({ origin: { kind: 'invocation', invocation }, writes: [], sends: [], publishes: [], replies: [] }, claim);
  }

  async fail(claim: Claim, problem: Problem): Promise<void> {
    const invocation = { message: claim.message, extension: claim.extension, outcome: { ok: false, problem } as const, stored: true };
    await this.commit({ origin: { kind: 'invocation', invocation }, writes: [], sends: [], publishes: [], replies: [] }, claim);
  }
}
