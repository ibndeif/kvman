import type { Ctx, Stored } from '@kvman/sdk';
import type { SessionDoc } from '../schemas/records.ts';
import { txRecords } from '../store/collections.ts';
import { isCleared } from './cleared-results.ts';
import { promptTokens, type Measured } from './compaction.ts';
import { modelInfo } from './model-info.ts';
import { sentHistory, type History } from './model-context.ts';
import { sentCharacters } from './sent-size.ts';
import type { StepLease } from './step-claim.ts';
import { liveStep } from './step-intents.ts';

// When old tool results are cleared (plan 08 §8.1, ADR 0094, 1; ADR 0102, 6): at the start of a step, over the results
// older than the newest 24,000 tokens of results; at a turn's first step after an hour without a model call, when the
// provider's cache has expired anyway, or at any step when there is much to clear and the prompt passes 80,000 tokens
// (half the window for a smaller model). A clear keeps few results, so the next one is many steps away and every step
// between reads the provider's cache.

const keptTokens = 24_000;
const largeTokens = 80_000;
const worthTokens = 20_000;
const cacheExpiredMs = 60 * 60 * 1000;

/** The newest result that may be cleared, and how many tokens the results not yet cleared up to it hold. */
export function clearable(history: History): { seq: number; tokens: number } | undefined {
  let kept = 0;
  let found: { seq: number; tokens: number } | undefined;
  for (const message of [...history.messages].reverse()) {
    if (message.kind !== 'toolResult') continue;
    const tokens = sentCharacters(message) / 4;
    if (kept < keptTokens) {
      kept += tokens;
      continue;
    }
    if (isCleared(message, history.cleared)) break;
    found = { seq: found?.seq ?? message.seq, tokens: (found?.tokens ?? 0) + tokens };
  }
  return found;
}

// The time of the chat's newest model call, from the replies it sends.
const lastCallAt = (history: History): number | undefined => {
  const reply = history.messages.findLast((message) => message.kind === 'assistant');
  return reply === undefined ? undefined : Date.parse(reply.createdAt);
};

/** Clears old results when one of the two moments has come; says whether it did. */
export async function clearOldResults(ctx: Ctx, session: Stored<SessionDoc>, lease: StepLease, firstStep: boolean, measured: Measured & { prompt: string }): Promise<boolean> {
  const history = await sentHistory(ctx, session.id, session.nextSeq);
  const candidate = clearable(history);
  if (candidate === undefined) return false;
  const last = lastCallAt(history);
  const expired = firstStep && last !== undefined && Date.now() - last > cacheExpiredMs;
  const window = (await modelInfo(ctx, session.model))?.contextWindow;
  const large = window === undefined ? largeTokens : Math.min(largeTokens, window / 2);
  const full = candidate.tokens > worthTokens && promptTokens(measured.prompt, history, measured).tokens > large;
  if (!expired && !full) return false;
  return ctx.store.transaction((tx) => {
    ctx.job.signal.throwIfAborted();
    const store = txRecords(tx);
    if (liveStep(store, lease, lease.jobId) === undefined) return false;
    store.sessions.update(session.id, { clearedThroughSeq: candidate.seq });
    return true;
  });
}
