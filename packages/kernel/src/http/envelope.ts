import { ProblemError, type Problem } from '@kvman/sdk';

// Every JSON answer under /api is `{ ok: true, …data }` or `{ ok: false, problem, jobId? }`, with status 200 (plan 04
// §4.1); a body that isn't JSON gets 400.

export function answer(data: Record<string, unknown>): Response {
  return Response.json({ ok: true, ...data });
}

export function failure(problem: Problem, options: { jobId?: string; status?: number } = {}): Response {
  const body = options.jobId === undefined ? { ok: false, problem } : { ok: false, problem, jobId: options.jobId };
  return Response.json(body, { status: options.status ?? 200 });
}

// The Problem a call failed with; anything else is a kernel fault and goes on up.
export function problemOf(error: unknown): Problem {
  if (error instanceof ProblemError) return error.problem;
  throw error;
}
