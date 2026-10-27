import { ProblemError, type Json } from '@kvman/sdk';

// kvvideo's Problems (plan 16 §16.9). Each code has `kvvideo.errors.<CODE>` texts in `en` and `ar`.

export type KvvideoCode = 'PROGRAM_MISSING' | 'BROWSER_MISSING' | 'STEP_FAILED' | 'NARRATION_NOT_SET' | 'NARRATION_KEY_MISSING' | 'NARRATION_FAILED' | 'RENDER_FAILED';

export const kvvideoCodes: readonly KvvideoCode[] = ['PROGRAM_MISSING', 'BROWSER_MISSING', 'STEP_FAILED', 'NARRATION_NOT_SET', 'NARRATION_KEY_MISSING', 'NARRATION_FAILED', 'RENDER_FAILED'];

/** A `kvvideo/<code>` Problem to throw. */
export function kvvideoProblem(code: KvvideoCode, message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: `kvvideo/${code}`, message, params });
}

/** A `VALIDATION_FAILED` Problem to throw. */
export function invalid(message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: 'VALIDATION_FAILED', message, params });
}

/** A `NOT_FOUND` Problem to throw. */
export function notFound(message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: 'NOT_FOUND', message, params });
}

/** Whether an error is the Problem of a kvvideo code. */
export function isKvvideoProblem(error: unknown, code: KvvideoCode): boolean {
  return error instanceof ProblemError && error.problem.code === `kvvideo/${code}`;
}
