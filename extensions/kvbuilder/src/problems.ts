import { ProblemError, type Json } from '@kvman/sdk';

// kvbuilder's Problems (plan 09 §9.1, ADR 0009, 126). Each code has `kvbuilder.errors.<CODE>` texts in `en` and `ar`.

export type KvbuilderCode = 'FOLDER_NOT_EMPTY' | 'FILE_EXISTS' | 'NOT_A_PROJECT' | 'NPM_FAILED' | 'NO_FREE_PORT' | 'PREVIEW_FAILED';

export const kvbuilderCodes: readonly KvbuilderCode[] = ['FOLDER_NOT_EMPTY', 'FILE_EXISTS', 'NOT_A_PROJECT', 'NPM_FAILED', 'NO_FREE_PORT', 'PREVIEW_FAILED'];

/** A `kvbuilder/<code>` Problem to throw. */
export function kvbuilderProblem(code: KvbuilderCode, message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: `kvbuilder/${code}`, message, params });
}

/** A `VALIDATION_FAILED` Problem to throw. */
export function invalid(message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: 'VALIDATION_FAILED', message, params });
}
