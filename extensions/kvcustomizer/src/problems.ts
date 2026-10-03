import { ProblemError, type Json } from '@kvman/sdk';

// kvcustomizer's Problems (plan 09 §9.1, ADR 0009, 126). Each code has `kvcustomizer.errors.<CODE>` texts in `en` and `ar`.

export type KvcustomizerCode = 'FOLDER_NOT_EMPTY' | 'FILE_EXISTS' | 'NOT_A_PROJECT' | 'NPM_FAILED' | 'NO_FREE_PORT' | 'PREVIEW_FAILED';

export const kvcustomizerCodes: readonly KvcustomizerCode[] = ['FOLDER_NOT_EMPTY', 'FILE_EXISTS', 'NOT_A_PROJECT', 'NPM_FAILED', 'NO_FREE_PORT', 'PREVIEW_FAILED'];

/** A `kvcustomizer/<code>` Problem to throw. */
export function kvcustomizerProblem(code: KvcustomizerCode, message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: `kvcustomizer/${code}`, message, params });
}

/** A `VALIDATION_FAILED` Problem to throw. */
export function invalid(message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: 'VALIDATION_FAILED', message, params });
}
