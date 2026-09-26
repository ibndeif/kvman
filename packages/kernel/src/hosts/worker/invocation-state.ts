import type { AbortReason, ConfigWrite, DeferredReply, InvokeFrame, KernelErrorCode, OutboundPublish, OutboundSend, SecretWrite } from '@kvman/protocol';
import type { Deferred } from '@kvman/sdk';
import { kernelProblem, ProblemError } from '../../problems.ts';
import { hostProblem } from './host-problems.ts';

export type Deferral = { marker: Deferred; onAbort: string | undefined };

// What one invocation collects for its unit of work (04 §4.2), and whether its ctx is still open (ADR 0076).
export class InvocationState {
  readonly invoke: InvokeFrame;
  readonly sends: OutboundSend[] = [];
  readonly publishes: OutboundPublish[] = [];
  readonly replies: DeferredReply[] = [];
  readonly config: ConfigWrite[] = [];
  readonly secrets: SecretWrite[] = [];
  deferral: Deferral | undefined;
  readonly #controller = new AbortController();
  #aborted: ProblemError | undefined;
  #commandCalls = 0;
  #closed = false;

  constructor(invoke: InvokeFrame) {
    this.invoke = invoke;
  }

  get abortProblem(): ProblemError | undefined {
    return this.#aborted;
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  // ADR 0084: an abort fires ctx.signal with the problem that ended the invocation; every later ctx call throws it.
  abort(reason: AbortReason): void {
    const { message, readOnly } = this.invoke;
    const codes: Record<AbortReason, KernelErrorCode> = { cancelled: 'CANCELLED', deadline: 'DEADLINE_EXCEEDED', timeout: readOnly ? 'QUERY_TIMEOUT' : 'HANDLER_TIMEOUT' };
    this.#aborted = new ProblemError(kernelProblem(codes[reason], { correlationId: message.correlationId, messageId: message.id }));
    this.#controller.abort(this.#aborted);
  }

  open(): void {
    if (this.#aborted !== undefined) throw this.#aborted;
    if (this.#closed) throw hostProblem(this.invoke.message, 'INTERNAL', 'the invocation has ended');
  }

  // A query reads; everything else it could do is refused (ADR 0074).
  writable(call: string): void {
    this.open();
    if (this.invoke.readOnly) throw hostProblem(this.invoke.message, 'CAPABILITY_DENIED', `a query cannot call ${call}`);
  }

  nextCommandOrdinal(): number {
    this.#commandCalls += 1;
    return this.#commandCalls;
  }

  close(): void {
    this.#closed = true;
  }
}
