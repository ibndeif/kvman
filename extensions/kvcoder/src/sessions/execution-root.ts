import type { Stored } from '@kvman/sdk';
import type { SessionDoc } from '../schemas/records.ts';
import type { TxRecords } from '../store/collections.ts';

/** Execution requires an existing, non-deleting ancestry; teardown uses its captured identity instead. */
export function executionRootInTx(store: TxRecords, sessionId: string): Stored<SessionDoc> | undefined {
  let current = store.sessions.get(sessionId);
  const visited = new Set<string>();
  while (current !== undefined) {
    if (current.deleting || visited.has(current.id)) return undefined;
    visited.add(current.id);
    if (current.parentId === null) return current;
    current = store.sessions.get(current.parentId);
  }
  return undefined;
}

/** Whether a delete owns this session's teardown. A missing or cyclic ancestry isn't one: its step still ends its turn. */
export function deletingInTx(store: TxRecords, sessionId: string): boolean {
  const visited = new Set<string>();
  for (let current = store.sessions.get(sessionId); current !== undefined && !visited.has(current.id); current = current.parentId === null ? undefined : store.sessions.get(current.parentId)) {
    if (current.deleting) return true;
    visited.add(current.id);
  }
  return false;
}
