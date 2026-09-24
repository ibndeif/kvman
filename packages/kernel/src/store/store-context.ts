import type { Issue, JsonObject, KernelErrorCode, StoreScope } from '@kvman/protocol';
import { kernelProblem, ProblemError, type ProblemContext } from '../problems.ts';
import type { CollectionDeclaration } from './collection-indexes.ts';
import type { PendingState } from './pending-state.ts';
import type { StoreReader } from './store-reader.ts';

export const storeLimits = {
  resultRows: 5000,
  resultBytes: 16 * 1024 * 1024,
  unindexedScanRows: 10_000,
  kvValueBytes: 1024 * 1024,
} as const;

export type DataDeclarations = { collections: readonly CollectionDeclaration[]; logs: readonly string[] };

export type UnindexedScan = { owner: string; collection: string; shape: string };

export class UnindexedScanWarnings {
  readonly #lastWarned = new Map<string, number>();
  readonly #now: () => number;
  readonly #report: (scan: UnindexedScan) => void;

  constructor(now: () => number, report: (scan: UnindexedScan) => void) {
    this.#now = now;
    this.#report = report;
  }

  note(scan: UnindexedScan): void {
    const key = JSON.stringify([scan.owner, scan.collection, scan.shape]);
    const last = this.#lastWarned.get(key);
    if (last !== undefined && this.#now() - last < 3_600_000) return;
    this.#lastWarned.set(key, this.#now());
    this.#report(scan);
  }
}

export type StoreContext = {
  reader: StoreReader;
  pending: PendingState;
  owner: string;
  workspaceId: string | undefined;
  data: DataDeclarations;
  validateDocument: (collection: string, document: JsonObject) => Issue[];
  correlationId: string;
  readOnly: boolean;
  unindexedScans: UnindexedScanWarnings;
};

export type ScopeBinding = { context: StoreContext; scope: StoreScope; ws: string };

export function storeFailure(context: StoreContext, code: KernelErrorCode, details: Omit<ProblemContext, 'correlationId'> = {}): ProblemError {
  return new ProblemError(kernelProblem(code, { correlationId: context.correlationId, ...details }));
}

export function requireWritable(context: StoreContext): void {
  if (context.readOnly) throw storeFailure(context, 'CAPABILITY_DENIED', { detail: 'a query reads the store and cannot write it' });
}

export function tooLarge(context: StoreContext, what: string): ProblemError {
  return storeFailure(context, 'STORE_RESULT_TOO_LARGE', {
    detail: `${what} holds more than ${storeLimits.resultRows} entries or ${storeLimits.resultBytes} bytes`,
    hint: 'add a filter or a limit',
  });
}
