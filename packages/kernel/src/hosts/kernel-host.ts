import { cancelRequestSchema, type Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { Connection } from '../storage/driver.ts';
import { cancelScope, mayCancel } from './cancel-scope.ts';
import { KernelStopping } from './extension-commands.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { KernelQueries } from './kernel-queries.ts';
import type { QueryPath } from './query-path.ts';

// A kernel command other than cancel and shutdown, run on the main thread; `signal` fires at shutdown.
export type KernelCommand = (claim: Claim, signal: AbortSignal) => Promise<void>;

export type KernelHostDeps = {
  connection: Connection;
  commits: KernelCommits;
  scheduler: Scheduler;
  grants: GrantsSource;
  queries: QueryPath;
  abortMessages: (messageIds: ReadonlySet<string>) => void;
  kernelQueries: KernelQueries;
  // The handlers of the other kernel commands by type (03 §3.8).
  commands: ReadonlyMap<string, KernelCommand>;
  // Called once kernel.shutdown's unit committed; the shutdown runs on its own, never inside this invocation.
  requestShutdown: () => void;
};

// ADR 0078: kernel commands run here, on the main thread, as kernel code; each commits its unit like any handler.
// A long one (staging fetches and runs the loader) is stopped by the kernel's shutdown and runs again at the next
// start (ADR 0091).
export class KernelHost {
  readonly #deps: KernelHostDeps;
  readonly #running = new AbortController();

  constructor(deps: KernelHostDeps) {
    this.#deps = deps;
  }

  async run(claim: Claim): Promise<void> {
    const { message } = claim;
    if (message.kind === 'query') {
      this.#deps.queries.answer(message.id, await this.#deps.kernelQueries.answer(message));
      return;
    }
    try {
      await this.#command(claim);
    } catch (error) {
      if (!(error instanceof KernelStopping)) throw error;
      await this.#deps.scheduler.redeliver(message.id);
    }
  }

  // Shutdown (03 §3.9): running kernel commands stop at once.
  interrupt(): void {
    this.#running.abort(new KernelStopping());
  }

  #command(claim: Claim): Promise<void> {
    const { type } = claim.message;
    if (type === 'kernel.cancel') return this.#cancel(claim);
    if (type === 'kernel.shutdown') return this.#shutdown(claim);
    const command = this.#deps.commands.get(type);
    return command === undefined ? this.#deps.commits.fail(claim, this.#unknown(claim)) : command(claim, this.#running.signal);
  }

  // ADR 0090: the reply {} commits first, then the kernel shuts down.
  async #shutdown(claim: Claim): Promise<void> {
    const result = await this.#deps.commits.reply(claim, {});
    if (result.committed) this.#deps.requestShutdown();
  }

  #unknown(claim: Claim): Problem {
    const { message } = claim;
    return kernelProblem('INTERNAL', { correlationId: message.correlationId, messageId: message.id, detail: `the kernel has no handler for ${message.type}` });
  }

  // 02 §2.9, ADRs 0079 and 0083.
  async #cancel(claim: Claim): Promise<void> {
    const { message } = claim;
    const { connection, scheduler, commits } = this.#deps;
    const request = cancelRequestSchema.parse(message.payload);
    if (!mayCancel(connection, this.#deps.grants, message, request)) {
      return commits.fail(claim, kernelProblem('CAPABILITY_DENIED', { correlationId: message.correlationId, messageId: message.id, detail: `${message.source} may not cancel these messages`, hint: 'cancel your own messages, or request kernel.admin' }));
    }
    const correlationId = 'correlationId' in request ? request.correlationId : undefined;
    const scope = cancelScope(connection, request, message, (ids) => scheduler.unstoredInScope(ids, undefined));
    const unstored = scheduler.unstoredInScope(scope.visited, correlationId).filter((id) => id !== message.id);
    const invocation = { message, extension: claim.extension, outcome: { ok: true, value: null } as const, stored: true };
    const result = await commits.commit({ origin: { kind: 'cancel', invocation, messageIds: scope.messageIds, unstored: unstored.length }, writes: [], sends: [], publishes: [], replies: [] }, claim);
    if (!result.committed) return;
    const ended = new Set(result.ended.map((entry) => entry.messageId));
    this.#deps.abortMessages(new Set([...ended, ...unstored]));
    scheduler.forget(ended);
    scheduler.dropUnstored(unstored);
  }
}
