import type { AbortReason, KernelErrorCode, Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { TimerHandle } from '../scheduler/timers.ts';
import type { ActiveInvocation } from './active-invocation.ts';

// 03 §3.4: an invocation that has not settled 2 s after its abort makes its host stuck.
export const stuckGraceMs = 2_000;

export type Aborted = { invocation: ActiveInvocation; reason: AbortReason; grace: TimerHandle };

export function abortProblem({ invocation, reason }: Aborted): Problem {
  const { message } = invocation.claim;
  const codes: Record<AbortReason, KernelErrorCode> = { cancelled: 'CANCELLED', deadline: 'DEADLINE_EXCEEDED', timeout: message.kind === 'query' ? 'QUERY_TIMEOUT' : 'HANDLER_TIMEOUT' };
  return kernelProblem(codes[reason], { correlationId: message.correlationId, messageId: message.id });
}
