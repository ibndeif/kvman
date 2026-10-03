import type { Json } from '@kvman/sdk';

// The failure codes every bin of this package uses (ADR 0010, 20). kvcustomizer turns each into
// `kvcustomizer/<CODE>`, except `VALIDATION_FAILED`, which stays as it is.

export const binFailureCodes = ['VALIDATION_FAILED', 'NOT_FOUND', 'NOT_RUNNING', 'FOLDER_NOT_EMPTY', 'FILE_EXISTS', 'NPM_FAILED', 'NO_FREE_PORT', 'PREVIEW_FAILED'] as const;

/** A code a bin fails with. */
export type BinFailureCode = (typeof binFailureCodes)[number];

/** A structured bin failure: `{ code, message, params? }`. */
export class BinFailure extends Error {
  /** The machine-readable code. */
  readonly code: BinFailureCode;
  /** The machine-readable details, if any. */
  readonly params: Record<string, Json> | undefined;

  /** Wraps a code, an English message, and optional JSON params. */
  constructor(code: BinFailureCode, message: string, params?: Record<string, Json>) {
    super(message);
    this.name = 'BinFailure';
    this.code = code;
    this.params = params;
  }
}

/** Prints a failure: one JSON object on stderr with `--json`, else the line `error: <message>`. */
export function printFailure(error: unknown, json: boolean): void {
  if (error instanceof BinFailure && json) {
    const output = error.params === undefined ? { code: error.code, message: error.message } : { code: error.code, message: error.message, params: error.params };
    process.stderr.write(`${JSON.stringify(output)}\n`);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${message}\n`);
}
