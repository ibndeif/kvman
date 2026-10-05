import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import type {} from '@kvman/kvai';
import type { MessageDoc, SessionDoc } from '../schemas/records.ts';
import { txRecords } from '../store/collections.ts';
import { appendMessage, appendNotice } from './history.ts';
import { modelInfo } from './model-info.ts';
import { sentHistory, textOf, type History } from './model-context.ts';

// Compaction (plan 08 §8.1): above `kvcoder.compactAt` of the model's window (characters / 4), kvai summarizes the
// older messages, the last 10 stay whole, and a summary message is stored. A step marks it in its stream with
// `compaction` chunks (ADR 0009, 99); a failed summary adds a notice and the step goes on.

const kept = 10;

const summarizer =
  'Summarize the conversation below for the agent that continues it: the goal, the decisions, the files and commands that matter, what is done, and what is left. Keep names, paths, and numbers exact. Reply with the summary only.';

function lineOf(message: Stored<MessageDoc>): string {
  const content = message.content;
  if (message.kind === 'toolResult') return `Tool result: ${textOf(content['content'])}`;
  if (message.kind === 'user') return `User: ${textOf(content['content'])}`;
  const calls = Array.isArray(content['content']) ? content['content'].flatMap((block) => (typeof block === 'object' && block !== null && !Array.isArray(block) && block['type'] === 'toolCall' ? [`[called ${String(block['name'])} ${JSON.stringify(block['arguments'] ?? {})}]`] : [])) : [];
  return `Assistant: ${[textOf(content['content']), ...calls].filter((part) => part !== '').join(' ')}`;
}

function transcript(history: History, older: readonly Stored<MessageDoc>[]): string {
  const summary = history.summary === undefined ? [] : [`Earlier summary: ${String(history.summary.content['text'] ?? '')}`];
  return [...summary, ...older.map(lineOf)].join('\n\n');
}

function estimate(prompt: string, history: History): number {
  const characters = prompt.length + JSON.stringify(history.summary?.content ?? '').length + history.messages.reduce((total, message) => total + JSON.stringify(message.content).length, 0);
  return characters / 4;
}

export type CompactOptions = { force: boolean; compactAt: number; prompt: string; turnId: string | null };

/** Summarizes the session's older messages when they pass the threshold, or always with `force`. */
export async function compact(ctx: Ctx, session: Stored<SessionDoc>, options: CompactOptions): Promise<void> {
  const history = await sentHistory(ctx, session.id, session.nextSeq);
  if (!options.force) {
    const info = await modelInfo(ctx, session.model);
    if (info === undefined || estimate(options.prompt, history) <= info.contextWindow * options.compactAt) return;
  }
  const older = history.messages.slice(0, Math.max(history.messages.length - kept, 0));
  const last = older.at(-1);
  if (last === undefined) return;
  ctx.job.progress({ type: 'compaction', state: 'started' });
  try {
    const answer = await ctx.exec('kvai.complete', { ...(session.model === null ? {} : { model: session.model }), sessionId: session.id, systemPrompt: summarizer, messages: [{ role: 'user', content: transcript(history, older), timestamp: Date.now() }] });
    const text = textOf(answer.message.content);
    await ctx.store.transaction((tx) => appendMessage(txRecords(tx), session, { kind: 'summary', content: { text, coversThroughSeq: last.seq }, turnId: options.turnId }));
  } catch (error) {
    if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
    const problem = error.problem;
    await ctx.store.transaction((tx) => appendNotice(txRecords(tx), session, 'SUMMARY_FAILED', { code: problem.code }, options.turnId));
  } finally {
    ctx.job.progress({ type: 'compaction', state: 'done' });
  }
}
