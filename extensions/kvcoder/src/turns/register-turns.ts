import { z, type Ctx } from '@kvman/sdk';
import { startApprovedRun } from '../delegate/approved-run.ts';
import { findSession, ownSession, userOnly } from '../sessions/session-lookup.ts';
import { turnSchema, turnView } from '../sessions/session-view.ts';
import { records, txRecords } from '../store/collections.ts';
import { cancelTurn } from './end-turn.ts';
import { applyAnswer } from './apply-answer.ts';
import { answerExtrasShape, checkExtras, rememberRule } from './answer-extras.ts';
import { receiptJob } from './receipt-job.ts';
import { recoverWorkspace } from './recover-workspace.ts';
import { retryTurn } from './retry-turn.ts';
import { dispatchStep } from './start-turn.ts';

// Turns (plan 08 §8.6): retry, cancel, list, and the person's answer to a question or approval.

export function registerTurns(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.turn.retry', {
    description: "Runs a stopped turn again on the session's history, without adding a message.",
    input: z.object({ sessionId: z.string() }),
    output: z.object({}),
    public: true,
    retries: 0,
    handle: async ({ sessionId }) => {
      userOnly(ctx, 'kvcoder.turn.retry');
      await retryTurn(ctx, await ownSession(ctx, sessionId));
      return {};
    },
  });
  ctx.registerCommand('kvcoder.turn.cancel', {
    description: "Cancels a session's turn: its step, its subagents' turns, and its questions. With turnId, only when that turn is still the current one.",
    input: z.object({ sessionId: z.string(), turnId: z.string().exactOptional() }),
    output: z.object({}),
    public: true,
    handle: async ({ sessionId, turnId }) => {
      await ownSession(ctx, sessionId);
      await cancelTurn(ctx, sessionId, true, turnId);
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
    input: z.object({ questionId: z.string(), answer: z.json(), ...answerExtrasShape }),
    output: z.object({ jobId: z.string().nullable() }),
    public: true,
    retries: 0,
    handle: async ({ questionId, answer, remember, reason }) => {
      userOnly(ctx, 'kvcoder.question.answer');
      const extras = { remember, reason };
      // A rule is saved before the answer applies, and only for a question that can take it (ADR 0091, 3).
      const asked = remember === undefined && reason === undefined ? undefined : await records(ctx.store).questions.get(questionId);
      if (asked !== undefined) checkExtras(asked, answer, extras);
      if (asked !== undefined && remember !== undefined) await rememberRule(ctx, remember);
      let result = await ctx.store.transaction(tx => applyAnswer(ctx, txRecords(tx), questionId, answer, extras));
      if (result.kind === 'delegate') {
        // Legacy positive launch has no receipt: recover first, then retain exact approval identity through preparation.
        await recoverWorkspace(ctx);
        const expected = result.question;
        result = await ctx.store.transaction(tx => {
          const store = txRecords(tx), current = applyAnswer(ctx, store, questionId, answer, extras, expected);
          return current;
        });
        if (result.kind === 'delegate') {
          ctx.job.signal.throwIfAborted();
          return { jobId: await startApprovedRun(ctx, { question: result.question, call: result.call }) };
        }
      }
      if (result.kind === 'acknowledged') return { jobId: await receiptJob(ctx, result.receipt) };
      // Only a newly committed application authorizes recovery; racing receipt acknowledgments never enter it.
      await recoverWorkspace(ctx, result.receipt.sessionId);
      return { jobId: result.identity === null ? null : await dispatchStep(ctx, result.identity, false) };
    },
  });
}
