import type { DeferredReply, InvokeFrame, OutboundPublish, OutboundSend } from '@kvman/protocol';
import type { Deferred } from '@kvman/sdk';
import { hostProblem } from './host-problems.ts';

export type Deferral = { marker: Deferred; onAbort: string | undefined };

// What one invocation collects for its unit of work (04 §4.2), and whether its ctx is still open (ADR 0076).
export class InvocationState {
  readonly invoke: InvokeFrame;
  readonly sends: OutboundSend[] = [];
  readonly publishes: OutboundPublish[] = [];
  readonly replies: DeferredReply[] = [];
  deferral: Deferral | undefined;
  #commandCalls = 0;
  #closed = false;

  constructor(invoke: InvokeFrame) {
    this.invoke = invoke;
  }

  open(): void {
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
