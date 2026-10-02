import { ProblemError, type Json } from '@kvman/sdk';

/** A `VALIDATION_FAILED` Problem to throw. */
export function invalid(message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: 'VALIDATION_FAILED', message, params });
}

/** A `TOO_LARGE` Problem to throw. */
export function tooLarge(message: string, limit: number): ProblemError {
  return new ProblemError({ code: 'TOO_LARGE', message, params: { limit } });
}

/** A `NOT_FOUND` Problem to throw. */
export function notFound(message: string, params: Record<string, Json> = {}): ProblemError {
  return new ProblemError({ code: 'NOT_FOUND', message, params });
}
