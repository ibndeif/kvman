import type { Json, Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { QueryRequest } from '../router/query-admission.ts';
import type { Router } from '../router/router.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';

// `etag` is the tag the `/ui` routes send with a kernel.ui.* answer (ADR 0159).
export type QueryAnswer = { ok: true; value: Json; etag?: string } | { ok: false; problem: Problem };

// A query is admitted, run on the scheduler's priority path, and answered in memory: it is never stored (02 §2.3).
export class QueryPath {
  readonly #router: Router;
  readonly #scheduler: Scheduler;
  readonly #waiting = new Map<string, (answer: QueryAnswer) => void>();

  constructor(router: Router, scheduler: Scheduler) {
    this.#router = router;
    this.#scheduler = scheduler;
  }

  ask(request: QueryRequest): Promise<QueryAnswer> {
    const admission = this.#router.admitQuery(request);
    if (!admission.ok) return Promise.resolve({ ok: false, problem: admission.problem });
    const answered = new Promise<QueryAnswer>((resolve) => this.#waiting.set(admission.admitted.message.id, resolve));
    this.#scheduler.submitQuery(admission.admitted);
    return answered;
  }

  // The kernel is stopping: every waiting query is answered with KERNEL_STOPPING (ADR 0090).
  close(): void {
    for (const queryId of [...this.#waiting.keys()]) {
      this.answer(queryId, { ok: false, problem: kernelProblem('KERNEL_STOPPING', { correlationId: queryId, messageId: queryId }) });
    }
  }

  answer(queryId: string, answer: QueryAnswer): void {
    const resolve = this.#waiting.get(queryId);
    this.#waiting.delete(queryId);
    resolve?.(answer);
  }
}
