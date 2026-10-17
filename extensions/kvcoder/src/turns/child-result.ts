import { z } from '@kvman/sdk';
import { truncate } from '../result-text.ts';
import type { Outcome } from '../schemas/records.ts';
import type { TxRecords } from '../store/collections.ts';
import { textOf } from './model-context.ts';

// What a finished subagent returns (ADR 0009, 102): its answer, or how and why it stopped (ADR 0050, 4). It reads
// inside a transaction, so the one that ends a child's turn can also deliver its result (ADR 0052, 2).

const noticeParamsSchema = z.object({ code: z.string(), details: z.object({ reason: z.string().exactOptional() }).exactOptional() });

// Why a child stopped, from the notice that ended it: the failure's code, and the provider's reason when it has one.
function stoppedBy(store: TxRecords, childId: string): { code: string; reason: string | undefined } | undefined {
  const [last] = store.messages.find({ sessionId: childId }, { limit: 1, order: 'desc' });
  const params = last?.kind === 'notice' ? noticeParamsSchema.safeParse(last.content['params']) : undefined;
  return params?.success === true ? { code: params.data.code, reason: params.data.details?.reason } : undefined;
}

export function childResultInTx(store: TxRecords, childId: string, outcome: Outcome): { text: string; isError: boolean } {
  const [last] = store.messages.find({ sessionId: childId, kind: 'assistant' }, { limit: 1, order: 'desc' });
  const answer = last === undefined ? '' : textOf(last.content['content']);
  // Every helper result ends with the helper's id, which `delegate continue` takes (ADR 0085, 4).
  const id = `\n\n(helper ${childId})`;
  if (outcome === 'done') return { text: `${truncate(answer)}${id}`, isError: false };
  const why = stoppedBy(store, childId);
  const lines = [`subagent ended ${outcome}${why === undefined ? '' : `: ${why.code}`}`, ...(why?.reason === undefined ? [] : [why.reason])];
  if (answer !== '') lines.push('', 'Its last message before it stopped (unfinished, not a result):', answer);
  return { text: `${truncate(lines.join('\n'))}${id}`, isError: true };
}
