import type { Issue, Json, KernelErrorCode, Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';

export type RefusalContext = { detail?: string; hint?: string; params?: Record<string, Json>; issues?: Issue[] };

// Admission stops at the first failed step; the step throws a Refusal and the admitter turns it into a Problem.
export class Refusal extends Error {
  readonly code: KernelErrorCode;
  readonly context: RefusalContext;

  constructor(code: KernelErrorCode, context: RefusalContext = {}) {
    super(`${code}${context.detail === undefined ? '' : `: ${context.detail}`}`);
    this.name = 'Refusal';
    this.code = code;
    this.context = context;
  }

  problem(correlationId: string): Problem {
    return kernelProblem(this.code, { correlationId, ...this.context });
  }
}

export function invalid(path: string, message: string, hint?: string): Refusal {
  return new Refusal('VALIDATION_FAILED', { issues: [hint === undefined ? { path, message } : { path, message, hint }] });
}
