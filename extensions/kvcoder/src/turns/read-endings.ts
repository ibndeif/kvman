import type { Ctx } from '@kvman/sdk';
import type { Source } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';

// A background run whose ended result the agent has already read with `background wait` (ADR 0108, 7; `output` is a
// query, which writes nothing):
// its "finished" message is not appended, and one already queued is dropped, so the model doesn't read it twice.

/** The run a background message reports, by its source. */
const refOf = (source: Source): string | undefined => (source.kind === 'job' ? source.jobId : source.kind === 'subagent' ? source.sessionId : undefined);

/** Whether the agent of `sessionId` already read how the run its `source` names ended. */
export function endingReadInTx(store: TxRecords, sessionId: string, source: Source): boolean {
  const ref = refOf(source);
  return ref !== undefined && store.readEndings.find({ sessionId, ref }, { limit: 1 }).length > 0;
}

/** Records that the agent read how `ref` ended, and drops that run's queued message. */
export async function markEndingRead(ctx: Ctx, sessionId: string, ref: string): Promise<void> {
  await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    if (store.readEndings.find({ sessionId, ref }, { limit: 1 }).length === 0) store.readEndings.insert({ sessionId, ref, createdAt: now() });
    for (const queued of store.queued.find({ sessionId }, { limit: 1000 })) if (refOf(queued.source) === ref) store.queued.delete(queued.id);
  });
}
