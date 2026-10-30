import type { Ctx, Stored } from '@kvman/sdk';
import type { MessageDoc, SessionDoc } from '../schemas/records.ts';
import { allDocs } from '../store/all-docs.ts';
import { records, txRecords } from '../store/collections.ts';
import { isCleared } from './cleared-results.ts';
import { collapsibleTurns, collapsedView, toolsLookups } from './collapse.ts';
import { promptTokens, type Measured } from './compaction.ts';
import { modelInfo } from './model-info.ts';
import { sentHistory, type History } from './model-context.ts';
import { sentCharacters } from './sent-size.ts';
import type { StepLease } from './step-claim.ts';
import { liveStep } from './step-intents.ts';

// The one trim of the history (plan 08 §8.1, ADR 0108, 5; ADR 0094, 1; ADR 0102, 6): at the start of a step, when the
// prompt passes 60,000 tokens (half the window for a smaller model) and the trim takes out enough to be worth a cache
// miss, or at a turn's first step after an hour without a model call, when the provider's cache has expired anyway.
// It collapses the finished turns and clears the results older than the newest 24,000 tokens of results, in one
// transaction, so the next trim is many steps away and every step between reads the provider's cache.

const keptTokens = 24_000;
const trimTokens = 60_000;
const worthTokens = 20_000;
const cacheExpiredMs = 60 * 60 * 1000;

/** The newest result that may be cleared, and how many tokens the results not yet cleared up to it hold; `mcp tools` lookups are never cleared. */
export function clearable(history: History): { seq: number; tokens: number } | undefined {
  const lookups = toolsLookups(history.messages);
  let kept = 0;
  let found: { seq: number; tokens: number } | undefined;
  for (const message of [...history.messages].reverse()) {
    if (message.kind !== 'toolResult' || lookups.has(String(message.content['toolCallId']))) continue;
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

const sizeOf = (messages: readonly Stored<MessageDoc>[]): number => messages.reduce((total, message) => total + sentCharacters(message), 0) / 4;

/** The last message of the newest turn that may be collapsed now, and how many tokens collapsing up to it takes out. */
async function collapsible(ctx: Ctx, sessionId: string, history: History): Promise<{ seq: number; tokens: number } | undefined> {
  const turns = collapsibleTurns(await allDocs((options) => records(ctx.store).turns.find({ sessionId }, options)));
  const ids = new Set(turns);
  const seq = history.messages.reduce((last, message) => (message.turnId !== null && ids.has(message.turnId) ? Math.max(last, message.seq) : last), -1);
  if (seq <= (history.collapsed ?? -1)) return undefined;
  const region = history.messages.filter((message) => message.seq <= seq);
  return { seq, tokens: sizeOf(region) - sizeOf(collapsedView(region, seq, new Map())) };
}

// The time of the chat's newest model call, from the replies it sends.
const lastCallAt = (history: History): number | undefined => {
  const reply = history.messages.findLast((message) => message.kind === 'assistant');
  return reply === undefined ? undefined : Date.parse(reply.createdAt);
};

/** Trims the history when one of the two moments has come; says whether it did. */
export async function clearOldResults(ctx: Ctx, session: Stored<SessionDoc>, lease: StepLease, firstStep: boolean, measured: Measured & { prompt: string }): Promise<boolean> {
  const history = await sentHistory(ctx, session.id, session.nextSeq);
  const clear = clearable(history);
  const collapse = await collapsible(ctx, session.id, history);
  if (clear === undefined && collapse === undefined) return false;
  const last = lastCallAt(history);
  const expired = firstStep && last !== undefined && Date.now() - last > cacheExpiredMs;
  const window = (await modelInfo(ctx, session.model))?.contextWindow;
  const limit = window === undefined ? trimTokens : Math.min(trimTokens, window / 2);
  const worth = (clear?.tokens ?? 0) + (collapse?.tokens ?? 0);
  const full = worth > worthTokens && promptTokens(measured.prompt, history, measured).tokens > limit;
  if (!expired && !full) return false;
  return ctx.store.transaction((tx) => {
    ctx.job.signal.throwIfAborted();
    const store = txRecords(tx);
    if (liveStep(store, lease, lease.jobId) === undefined) return false;
    store.sessions.update(session.id, { ...(clear === undefined ? {} : { clearedThroughSeq: clear.seq }), ...(collapse === undefined ? {} : { collapsedThroughSeq: collapse.seq }) });
    return true;
  });
}
