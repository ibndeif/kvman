import type { Issue, JsonObject, KernelErrorCode, StoreScope } from '@kvman/protocol';
import { kernelProblem, ProblemError, type ProblemContext } from '../problems.ts';
import type { BlobChannel } from './blob-api.ts';
import type { CollectionDeclaration } from './collection-indexes.ts';
import type { PendingState } from './pending-state.ts';
import type { ReadScope, StoreReads } from './store-reads.ts';

export const storeLimits = {
  resultRows: 5000,
  resultBytes: 16 * 1024 * 1024,
  unindexedScanRows: 10_000,
  kvValueBytes: 1024 * 1024,
} as const;

export type DataDeclarations = { collections: readonly CollectionDeclaration[]; logs: readonly string[] };

export type UnindexedScan = { owner: string; collection: string; shape: string };

// Where a store notes a scan without a matching index.
export interface ScanNotes {
  note(scan: UnindexedScan): void;
}

// At most one warning per owner, collection, and query shape per hour, however many invocations scan.
export class UnindexedScanThrottle {
  readonly #lastWarned = new Map<string, number>();
  readonly #now: () => number;

  constructor(now: () => number) {
    this.#now = now;
  }

  due(scan: UnindexedScan): boolean {
    const key = JSON.stringify([scan.owner, scan.collection, scan.shape]);
    const last = this.#lastWarned.get(key);
    if (last !== undefined && this.#now() - last < 3_600_000) return false;
    this.#lastWarned.set(key, this.#now());
    return true;
  }
}

export class UnindexedScanWarnings implements ScanNotes {
  readonly #throttle: UnindexedScanThrottle;
  readonly #report: (scan: UnindexedScan) => void;

  constructor(throttle: UnindexedScanThrottle, report: (scan: UnindexedScan) => void) {
    this.#throttle = throttle;
    this.#report = report;
  }

  note(scan: UnindexedScan): void {
    if (this.#throttle.due(scan)) this.#report(scan);
  }
}

export type StoreContext = {
  reader: StoreReads;
  blobs: BlobChannel;
  pending: PendingState;
  owner: string;
  workspaceId: string | undefined;
  data: DataDeclarations;
  validateDocument: (collection: string, document: JsonObject) => Issue[];
  correlationId: string;
  readOnly: boolean;
  unindexedScans: ScanNotes;
};

export type ScopeBinding = { context: StoreContext; scope: StoreScope; ws: string };

export function readScopeOf({ context, scope, ws }: ScopeBinding): ReadScope {
  return { owner: context.owner, ws, scope };
}

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
