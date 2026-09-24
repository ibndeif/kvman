import { kernelErrors, type Issue, type Json, type KernelErrorCode, type Problem } from '@kvman/protocol';

export type ProblemContext = {
  correlationId: string;
  messageId?: string;
  detail?: string;
  hint?: string;
  params?: Record<string, Json>;
  retryable?: boolean;
  retryAfterMs?: number;
  issues?: Issue[];
};

export function kernelProblem(code: KernelErrorCode, context: ProblemContext): Problem {
  const { retryable, ...rest } = context;
  return { code, title: kernelErrors[code].title, retryable: retryable ?? kernelErrors[code].retryable, ...rest };
}

export class ProblemError extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(`${problem.code}: ${problem.title}`);
    this.name = 'ProblemError';
    this.problem = problem;
  }
}
