import { cancelRequestSchema, type Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { CommitResult, CommitUnit } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import { cancelScope, mayCancel } from './cancel-scope.ts';
import type { KernelQueries } from './kernel-queries.ts';
import type { QueryPath } from './query-path.ts';
import type { ReplyWaiters } from './reply-waiters.ts';

export type KernelHostDeps = {
  connection: Connection;
  pipeline: CommitPipeline;
  scheduler: Scheduler;
  waiters: ReplyWaiters;
  grants: GrantsSource;
  queries: QueryPath;
  abortMessages: (messageIds: ReadonlySet<string>) => void;
  kernelQueries: KernelQueries;
  // Called once kernel.shutdown's unit committed; the shutdown runs on its own, never inside this invocation.
  requestShutdown: () => void;
};

// ADR 0078: kernel commands run here, on the main thread, as kernel code; each commits its unit like any handler.
export class KernelHost {
  readonly #deps: KernelHostDeps;

  constructor(deps: KernelHostDeps) {
    this.#deps = deps;
  }

  async run(claim: Claim): Promise<void> {
    const { message } = claim;
    if (message.kind === 'query') {
      this.#answer(claim);
      return;
    }
    if (message.type === 'kernel.cancel') return this.#cancel(claim);
    if (message.type === 'kernel.shutdown') return this.#shutdown(claim);
    return this.#fail(claim, this.#unknown(claim));
  }

  // Kernel queries are answered in memory, like every query (02 §2.3).
  #answer(claim: Claim): void {
    this.#deps.queries.answer(claim.message.id, this.#deps.kernelQueries.answer(claim.message));
  }

  // ADR 0090: the reply {} commits first, then the kernel shuts down.
  async #shutdown(claim: Claim): Promise<void> {
    const invocation = { message: claim.message, extension: claim.extension, outcome: { ok: true, value: {} } as const, stored: true };
    const result = await this.#commit({ origin: { kind: 'invocation', invocation }, writes: [], sends: [], publishes: [], replies: [] }, claim);
    if (result.committed) this.#deps.requestShutdown();
  }

  #unknown(claim: Claim): Problem {
    const { message } = claim;
    return kernelProblem('INTERNAL', { correlationId: message.correlationId, messageId: message.id, detail: `the kernel has no handler for ${message.type}` });
  }

  // 02 §2.9, ADRs 0079 and 0083.
  async #cancel(claim: Claim): Promise<void> {
    const { message } = claim;
    const { connection, scheduler } = this.#deps;
    const request = cancelRequestSchema.parse(message.payload);
    if (!mayCancel(connection, this.#deps.grants, message, request)) {
      return this.#fail(claim, kernelProblem('CAPABILITY_DENIED', { correlationId: message.correlationId, messageId: message.id, detail: `${message.source} may not cancel these messages`, hint: 'cancel your own messages, or request kernel.admin' }));
    }
    const correlationId = 'correlationId' in request ? request.correlationId : undefined;
    const scope = cancelScope(connection, request, message, (ids) => scheduler.unstoredInScope(ids, undefined));
    const unstored = scheduler.unstoredInScope(scope.visited, correlationId).filter((id) => id !== message.id);
    const invocation = { message, extension: claim.extension, outcome: { ok: true, value: null } as const, stored: true };
    const result = await this.#commit({ origin: { kind: 'cancel', invocation, messageIds: scope.messageIds, unstored: unstored.length }, writes: [], sends: [], publishes: [], replies: [] }, claim);
    if (!result.committed) return;
    const ended = new Set(result.ended.map((entry) => entry.messageId));
    this.#deps.abortMessages(new Set([...ended, ...unstored]));
    scheduler.forget(ended);
    scheduler.dropUnstored(unstored);
  }

  async #fail(claim: Claim, problem: Problem): Promise<void> {
    const invocation = { message: claim.message, extension: claim.extension, outcome: { ok: false, problem } as const, stored: true };
    await this.#commit({ origin: { kind: 'invocation', invocation }, writes: [], sends: [], publishes: [], replies: [] }, claim);
  }

  async #commit(unit: CommitUnit, claim: Claim): Promise<CommitResult> {
    const result = await this.#deps.pipeline.enqueue(unit);
    if (result.committed) {
      this.#deps.scheduler.settled(claim.message.id);
      this.#deps.waiters.resolve(result.replies);
    } else if (!result.stale && result.problem.retryable) {
      await this.#deps.scheduler.failed(claim.message.id, result.problem);
    } else if (!result.stale && unit.origin.kind === 'cancel') {
      await this.#fail(claim, result.problem);
    }
    return result;
  }
}
