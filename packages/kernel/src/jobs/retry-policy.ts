import type { Problem } from '@kvman/sdk';

// Which failed attempts run again, and when (plan 02 §2.3, ADR 0009, 14).

const retriedCodes: ReadonlySet<string> = new Set(['HANDLER_FAILED', 'TIMEOUT', 'WORKER_CRASHED', 'INTERRUPTED']);

export function isRetried(problem: Problem): boolean {
  return retriedCodes.has(problem.code);
}

// 1 s after the first attempt, then 2 s, 4 s, …
export function backoffMs(attempts: number): number {
  return 1000 * 2 ** (attempts - 1);
}
