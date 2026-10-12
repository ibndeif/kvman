import { createHash } from 'node:crypto';
import { addCallUsage } from './usage.ts';
import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import type {} from '@kvman/kvai';
import type { MessageDoc, SessionDoc } from '../schemas/records.ts';
import { runTool } from '../calls/run-tool.ts';
import { txRecords } from '../store/collections.ts';
import { currentStep, type StepLease } from './step-claim.ts';
import { liveStep } from './step-intents.ts';
import { olderCount } from './call-groups.ts';
import { appendMessage, appendNotice } from './history.ts';
import { modelInfo } from './model-info.ts';
import { modelMessages, sentHistory, textOf, type History } from './model-context.ts';
import { sentCharacters } from './sent-size.ts';

// Compaction (plan 08 §8.1): above `kvcoder.compactAt` of the model's window, by the provider's own count, kvai summarizes the
// older messages, the last `kvcoder.compactKeep` stay whole (ADR 0020, 1) with the reply whose results they start at
// (ADR 0036, 16), and a summary message is stored. The request
// is a step's own, with the instruction as its last message, so the older messages are read from the provider's cache
// (ADR 0032, 2). A step marks it in its stream with `compaction` chunks (ADR 0009, 99); a failed summary, or one with
// no text, adds a notice and the step goes on. Older messages smaller than a tenth of the model's window aren't
// summarized, so a full chat isn't summarized again on every step (ADR 0019, 7).

const minimumShare = 0.1;

const instruction =
  "Summarize the conversation above for the agent that continues it: the goal, the decisions, the files and commands that matter, what is done, and what is left. Keep names, paths, and numbers exact. Write at most 1,500 words: fold an earlier summary into this one instead of repeating it, and leave out what the files themselves record. This instruction comes from kvman, not from the person: don't record it in the summary as a request or a direction. Reply with the summary only, and call no tool.";

const sentTokens = (messages: readonly Stored<MessageDoc>[]): number => messages.reduce((total, message) => total + sentCharacters(message), 0) / 4;

// The whole prompt of a model call, as its provider counted it; 0 when the provider reported none.
const reportedPrompt = (message: Stored<MessageDoc>): number => (message.usage === null ? 0 : message.usage.input + message.usage.cacheRead + message.usage.cacheWrite);

/** What a provider's count was measured with: the system prompt and the tool names of the call (ADR 0058, 2). */
export const promptBasis = (prompt: string, tools: readonly string[]): string => createHash('sha256').update(JSON.stringify([prompt, tools])).digest('hex');

/** The model and the basis the next call would be made with. */
export type Measured = { model: string | null; basis: string };

// The prompt's size in tokens (ADR 0033, 4 and 5): the provider's count at the chat's last call, with what was added
// since. A call from before the latest summary held the messages the summary replaced, so it doesn't count, and
// neither does one made with another model, prompt, or tool set: the size is then an estimate from the text.
export function promptTokens(prompt: string, history: History, now: Measured): { tokens: number; estimated: boolean } {
  const summarizedAt = history.summary?.seq ?? -1;
  const index = history.messages.findLastIndex((message) => message.seq > summarizedAt && reportedPrompt(message) > 0);
  const counted = history.messages[index];
  const same = counted !== undefined && counted.basis === now.basis && (now.model === null || counted.model === now.model);
  if (counted === undefined || !same) return { tokens: (prompt.length + String(history.summary?.content['text'] ?? '').length) / 4 + sentTokens(history.messages), estimated: true };
  return { tokens: reportedPrompt(counted) + (counted.usage?.output ?? 0) + sentTokens(history.messages.slice(index + 1)), estimated: false };
}

/** `prompt` and `tools` are the step's own: its system prompt and the connectors its `run` tool names. */
export type CompactOptions = { force: boolean; compactAt: number; keep: number; prompt: string; tools: readonly string[]; turnId: string | null; lease?: StepLease };

async function summaryFailed(ctx: Ctx, session: Stored<SessionDoc>, code: string, options: CompactOptions): Promise<false> {
  await ctx.store.transaction(tx => {
    ctx.job.signal.throwIfAborted();
    const store = txRecords(tx);
    const current = options.lease === undefined ? session : liveStep(store, options.lease, options.lease.jobId)?.session;
    if (current !== undefined) appendNotice(store, current, 'SUMMARY_FAILED', { code }, options.turnId);
  });
  return false;
}

/** Summarizes the session's older messages when they pass the threshold, or with `force` whatever the threshold; says whether a summary was stored. */
export async function compact(ctx: Ctx, session: Stored<SessionDoc>, options: CompactOptions): Promise<boolean> {
  const history = await sentHistory(ctx, session.id, session.nextSeq);
  const info = await modelInfo(ctx, session.model);
  if (!options.force && (info === undefined || promptTokens(options.prompt, history, { model: session.model, basis: promptBasis(options.prompt, options.tools) }).tokens <= info.contextWindow * options.compactAt)) return false;
  const older = history.messages.slice(0, olderCount(history.messages, options.keep));
  const last = older.at(-1);
  if (last === undefined || (info !== undefined && sentTokens(older) < info.contextWindow * minimumShare)) return false;
  ctx.job.progress({ type: 'compaction', state: 'started' });
  try {
    const messages = [...(await modelMessages(ctx, { summary: history.summary, messages: older })), { role: 'user' as const, content: instruction, timestamp: Date.now() }];
    if (options.lease !== undefined && await currentStep(ctx, options.lease) === undefined) return false;
    const answer = await ctx.exec('kvai.complete', { ...(session.model === null ? {} : { model: session.model }), sessionId: session.id, systemPrompt: options.prompt, messages, tools: [runTool(options.tools)], thinking: session.thinking });
    const text = textOf(answer.message.content);
    if (text.trim() === '') return await summaryFailed(ctx, session, 'kvcoder/SUMMARY_EMPTY', options);
    return await ctx.store.transaction(tx => {
      ctx.job.signal.throwIfAborted();
      const store = txRecords(tx);
      const current = options.lease === undefined ? session : liveStep(store, options.lease, options.lease.jobId)?.session;
      if (current === undefined) return false;
      appendMessage(store, current, { kind: 'summary', content: { text, coversThroughSeq: last.seq }, turnId: options.turnId });
      addCallUsage(store, current, options.turnId, answer.usage, 'summary');
      return true;
    });
  } catch (error) {
    if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
    return await summaryFailed(ctx, session, error.problem.code, options);
  } finally {
    ctx.job.progress({ type: 'compaction', state: 'done' });
  }
}
