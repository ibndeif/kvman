import type { Stored } from '@kvman/sdk';
import type { FileBackupDoc } from '../schemas/records.ts';
import { executionRootInTx } from '../sessions/execution-root.ts';
import { now } from '../sessions/session-lookup.ts';
import type { TxRecords } from '../store/collections.ts';

// The record of each change a chat makes to a file (plan 08 §8.5; ADR 0053, 4; ADR 0118, 3 and 4): kept for the chat's
// life, its content apart in `file-copies`, ordered by the chat's change counter, and marked with the chat's `nextSeq`.

/** The largest content before a change that is kept. */
export const copyLimit = 1024 * 1024;

export type Copy = Stored<FileBackupDoc>;

/** What a file held before a change: nothing, its content, or content over 1 MB that wasn't kept. */
export type Before = { kind: 'absent' } | { kind: 'content'; bytes: Buffer } | { kind: 'tooLarge' };

const pageSize = 1000;

/** Every record of the file a session changed, oldest first. */
export function copiesOf(store: TxRecords, sessionId: string, real: string): Copy[] {
  const found: Copy[] = [];
  for (let page = store.fileBackups.find({ sessionId, path: real }, { limit: pageSize }); page.length > 0; page = store.fileBackups.find({ sessionId, path: real }, { limit: pageSize, after: found.at(-1)?.id ?? '' })) {
    found.push(...page);
    if (page.length < pageSize) break;
  }
  return found.sort(byOrder);
}

// Records from before ADR 0118 have no `order` and come first, by time; times can be equal, the counter can't.
export function byOrder(first: Copy, second: Copy): number {
  if (first.order !== null && second.order !== null) return first.order - second.order;
  if (first.order !== second.order) return first.order === null ? -1 : 1;
  return first.createdAt.localeCompare(second.createdAt) || first.id.localeCompare(second.id);
}

/** The newest change an undo may take back: not undone, and not an undo itself. */
export function newestLive(copies: readonly Copy[]): Copy | undefined {
  return copies.findLast((copy) => !copy.undone && copy.undoes === null);
}

/** What the file held before `copy`. */
export function beforeOf(store: TxRecords, copy: Copy): Before {
  if (copy.tooLarge) return { kind: 'tooLarge' };
  if (copy.kept !== null) {
    const kept = store.fileCopies.get(copy.kept);
    return kept === undefined ? { kind: 'tooLarge' } : { kind: 'content', bytes: Buffer.from(kept.content, 'base64') };
  }
  return copy.previous === null ? { kind: 'absent' } : { kind: 'content', bytes: Buffer.from(copy.previous, 'base64') };
}

/** Deletes a record and the content it kept. */
export function dropCopy(store: TxRecords, copy: Copy): void {
  if (copy.kept !== null) store.fileCopies.delete(copy.kept);
  store.fileBackups.delete(copy.id);
}

/**
 * Records a change of `real` by `sessionId`: `previous` is what the file held (`undefined` when it didn't exist), and
 * `written` the fingerprint it holds now (`null` when the change removed it). The chat's counter rises in the same
 * transaction, so the records of one chat are in the order their changes were made.
 */
export function recordChange(store: TxRecords, sessionId: string, real: string, previous: Buffer | undefined, written: string | null, undoes: string | null = null): Copy {
  const root = executionRootInTx(store, sessionId);
  if (root !== undefined) store.sessions.update(root.id, { changes: root.changes + 1 });
  const tooLarge = previous !== undefined && previous.length > copyLimit;
  const kept = previous === undefined || tooLarge ? null : store.fileCopies.insert({ sessionId, content: previous.toString('base64') }).id;
  return store.fileBackups.insert({ sessionId, path: real, previous: null, kept, written, tooLarge, atSeq: root?.nextSeq ?? null, order: root?.changes ?? null, turnId: root?.turnId ?? null, undoes, undone: false, createdAt: now() });
}
