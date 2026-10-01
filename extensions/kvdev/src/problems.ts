import { ProblemError, type Json } from '@kvman/sdk';

// kvdev's Problems (plan 09 §9.1, ADR 0009, 126). Each code has `kvdev.errors.<CODE>` texts in `en` and `ar`.

export type KvdevCode = 'FOLDER_NOT_EMPTY' | 'FILE_EXISTS' | 'NOT_A_PROJECT' | 'NPM_FAILED' | 'NO_FREE_PORT' | 'PREVIEW_FAILED';

export const kvdevCodes: readonly KvdevCode[] = ['FOLDER_NOT_EMPTY', 'FILE_EXISTS', 'NOT_A_PROJECT', 'NPM_FAILED', 'NO_FREE_PORT', 'PREVIEW_FAILED'];

/** A `kvdev/<code>` Problem to throw. */
export function kvdevProblem(code: KvdevCode, message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: `kvdev/${code}`, message, params });
}

/** A `VALIDATION_FAILED` Problem to throw. */
export function invalid(message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: 'VALIDATION_FAILED', message, params });
}
