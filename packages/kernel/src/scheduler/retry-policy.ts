import type { Message, MessageDeadLettered, Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { CommitUnit, RetryOutcome } from '../storage/commit-unit.ts';

export const schedulerDefaults = { handlerConcurrency: 16, extensionConcurrency: 64, maxAttempts: 3, conflictReruns: 5 } as const;

const backoffLadderMs = [1_000, 5_000, 30_000] as const;

// ADR 0059: retry n waits the n-th step of the ladder, and the last step for every later retry.
export function backoffMs(retry: number): number {
  return backoffLadderMs[Math.min(retry, backoffLadderMs.length) - 1] ?? backoffLadderMs[0];
}

// A failed run: `attempts` counts runs, so the run that reaches maxAttempts makes the message dead (ADR 0059). A dead
// message stores MESSAGE_DEAD for its waiters (ADR 0062).
export function retryOutcome(message: Message, attempts: number, maxAttempts: number, problem: Problem, now: number): RetryOutcome {
  if (attempts < maxAttempts) return { state: 'pending', notBefore: now + backoffMs(attempts) };
  const dead = kernelProblem('MESSAGE_DEAD', {
    correlationId: message.correlationId, messageId: message.id, detail: `the last of ${attempts} attempts failed with ${problem.code}`,
  });
  return { state: 'dead', reply: { ok: false, problem: dead } };
}

// A dead message announces itself in its own workspace, caused by it (ADR 0061).
export function retryUnit(message: Message, attempts: number, outcome: RetryOutcome): CommitUnit {
  const deadLettered: MessageDeadLettered = { messageId: message.id, type: message.type, correlationId: message.correlationId };
  return {
    origin: { kind: 'retry', message, attempts, outcome }, writes: [], sends: [],
    publishes: outcome.state === 'dead' ? [{ type: 'kernel.message.dead-lettered', payload: deadLettered }] : [],
  };
}
