import type { Stored } from '@kvman/sdk';
import type { SessionDoc, Usage } from '../schemas/records.ts';
import type { TxRecords } from '../store/collections.ts';
import { addUsage } from './history.ts';

// Where a model call's usage goes (ADR 0058, 1): to its session, to the turn it was made in, and to the parent of a
// helper, once each. A summary's and the title's are also kept apart, and so is what a session's helpers spent.

export type CallKind = 'reply' | 'summary' | 'title';

/** Adds one call's usage in the caller's transaction, which has checked that the call still belongs to its step. */
export function addCallUsage(store: TxRecords, session: Stored<SessionDoc>, turnId: string | null, usage: Usage, kind: CallKind = 'reply'): void {
  const turn = turnId === null ? undefined : store.turns.get(turnId);
  if (turn !== undefined) store.turns.update(turn.id, { usage: addUsage(turn.usage, usage) });
  const current = store.sessions.get(session.id) ?? session;
  const usageBy = kind === 'reply' ? current.usageBy : { ...current.usageBy, [kind]: addUsage(current.usageBy[kind], usage) };
  store.sessions.update(session.id, { usage: addUsage(current.usage, usage), usageBy });
  const parent = session.parentId === null ? undefined : store.sessions.get(session.parentId);
  if (parent === undefined) return;
  store.sessions.update(parent.id, { usage: addUsage(parent.usage, usage), usageBy: { ...parent.usageBy, helpers: addUsage(parent.usageBy.helpers, usage) } });
  const parentTurn = parent.turnId === null ? undefined : store.turns.get(parent.turnId);
  if (parentTurn !== undefined) store.turns.update(parentTurn.id, { usage: addUsage(parentTurn.usage, usage) });
}
