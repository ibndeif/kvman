import { z, type Ctx } from '@kvman/sdk';
import { checkedAnswer } from '../calls/ask.ts';
import type { HeldResult } from '../schemas/records.ts';
import { findSession, ownSession, userOnly } from '../sessions/session-lookup.ts';
import { turnSchema, turnView } from '../sessions/session-view.ts';
import { records, txRecords } from '../store/collections.ts';
import { cancelTurn } from './cancel-turn.ts';
import { heldText, resolvePending } from './resolve.ts';

// Turns (plan 08 §8.6): cancel, list, and the person's answer to a question or approval.

const runSchema = z.object({ command: z.string(), timeoutMs: z.number().int().positive() });

export function registerTurns(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.turn.cancel', {
    description: "Cancels a session's turn: its step, its subagents' turns, and its questions.",
    input: z.object({ sessionId: z.string() }),
    output: z.object({}),
    public: true,
    handle: async ({ sessionId }) => {
      await ownSession(ctx, sessionId);
      await cancelTurn(ctx, sessionId, true);
      return {};
    },
  });
  ctx.registerQuery('kvcoder.turn.list', {
    description: "Lists a session's turns, newest first.",
    input: z.object({ sessionId: z.string(), limit: z.number().int().positive().max(1000) }),
    output: z.array(turnSchema),
    public: true,
    handle: async ({ sessionId, limit }) => {
      await findSession(ctx, sessionId);
      return (await records(ctx.store).turns.find({ sessionId }, { limit, order: 'desc' })).map(turnView);
    },
  });
  ctx.registerCommand('kvcoder.question.answer', {
    description: "Answers a pending question or approval; returns the next step's job id once nothing else is pending.",
    input: z.object({ questionId: z.string(), answer: z.json() }),
    output: z.object({ jobId: z.string().nullable() }),
    public: true,
    retries: 0,
    handle: async ({ questionId, answer }) => {
      userOnly(ctx, 'kvcoder.question.answer');
      const question = await records(ctx.store).questions.get(questionId);
      if (question === undefined) throw ctx.problem('kvcoder/QUESTION_NOT_FOUND', { questionId });
      const checked = checkedAnswer(question, answer);
      const taken = await ctx.store.transaction((tx) => {
        const { questions } = txRecords(tx);
        if (questions.get(questionId) === undefined) return false;
        questions.delete(questionId);
        return true;
      });
      if (!taken) throw ctx.problem('kvcoder/QUESTION_NOT_FOUND', { questionId });
      const held: HeldResult =
        checked.kind === 'result'
          ? heldText(question.toolCallId, checked.text, false)
          : checked.approved
            ? { toolCallId: question.toolCallId, text: '', details: null, isError: false, run: runSchema.parse(question.question) }
            : heldText(question.toolCallId, 'denied by the user', true);
      return { jobId: await resolvePending(ctx, question.sessionId, question.toolCallId, held, false) };
    },
  });
}
