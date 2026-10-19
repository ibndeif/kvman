import type { Ctx, Json, Stored } from '@kvman/sdk';
import { checkedAnswer } from '../connectors/ask.ts';
import { isDelegateRun } from '../delegate/approved-run.ts';
import { invalid } from '../problems.ts';
import { runCallSchema, type AnswerReceiptDoc, type HeldResult, type QuestionDoc, type RunCallDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import type { TxRecords } from '../store/collections.ts';
import { answerFingerprint } from './answer-fingerprint.ts';
import { allowHostInTx } from '../web/web-hosts.ts';
import { checkExtras, type AnswerExtras } from './answer-extras.ts';
import { heldText, resolvePendingInTx } from './resolve.ts';
import type { StepIdentity } from './step-intents.ts';

export type AnswerApplication =
  | { kind: 'acknowledged'; receipt: Stored<AnswerReceiptDoc> }
  | { kind: 'applied'; receipt: Stored<AnswerReceiptDoc>; identity: StepIdentity | null }
  | { kind: 'delegate'; question: Stored<QuestionDoc>; call: RunCallDoc };

/** No awaits or effects: the first valid ordinary application and all its records commit together. */
export function applyAnswer(ctx: Ctx, store: TxRecords, questionId: string, answer: Json, extras: AnswerExtras, expected?: Stored<QuestionDoc>): AnswerApplication {
  ctx.job.signal.throwIfAborted();
  const [receipt] = store.answerReceipts.find({ questionId }, { limit: 1 });
  if (receipt !== undefined) {
    if (answerFingerprint(receipt.questionKind, answer, extras) !== receipt.answerFingerprint) throw invalid('This question already has a different answer.');
    return { kind: 'acknowledged', receipt };
  }
  const question = store.questions.get(questionId);
  const missing = () => ctx.problem('kvcoder/QUESTION_NOT_FOUND', { questionId });
  if (question === undefined) throw missing();
  if (expected !== undefined && (question.sessionId !== expected.sessionId || question.turnId !== expected.turnId || question.toolCallId !== expected.toolCallId || question.kind !== expected.kind || JSON.stringify(question.question) !== JSON.stringify(expected.question))) throw missing();
  const session = store.sessions.get(question.sessionId), turn = store.turns.get(question.turnId);
  if (session?.status !== 'waiting' || session.turnId !== question.turnId || turn?.sessionId !== question.sessionId || turn.outcome !== null || turn.endedAt !== null) throw missing();
  const candidates = turn.pending.filter(item => item.toolCallId === question.toolCallId || item.questionId === questionId);
  const pending = candidates[0];
  if (candidates.length !== 1 || pending?.toolCallId !== question.toolCallId || pending.questionId !== questionId || pending.kind !== (question.kind === 'approval' ? 'approval' : 'question') || pending.childSessionId !== null || pending.runId !== null || pending.question === null || turn.results.some(item => item.toolCallId === question.toolCallId)) throw missing();
  const checked = checkedAnswer(question, answer);
  checkExtras(question, answer, extras);
  const call = checked.kind === 'approval' && checked.approved ? runCallSchema.parse(question.question) : undefined;
  // Existing run records cannot prove durable launch. Keep grants on their existing separate flow, WITHOUT receipts.
  if (call !== undefined && isDelegateRun(call)) return { kind: 'delegate', question, call };
  const held: HeldResult = checked.kind === 'result'
    ? heldText(question.toolCallId, checked.text, false)
    : call !== undefined
      ? { toolCallId: question.toolCallId, text: '', details: null, isError: false, run: call }
      : heldText(question.toolCallId, extras.reason === undefined ? 'denied by the user' : `denied by the user: ${extras.reason}`, true);
  // An allowed fetch lets the chat reach its host from now on (ADR 0095, 4).
  if (call !== undefined) allowHostInTx(store, question.sessionId, call);
  const fingerprint = answerFingerprint(question.kind, answer, extras);
  ctx.job.signal.throwIfAborted();
  store.questions.delete(questionId);
  const identity = resolvePendingInTx(store, question.sessionId, question.toolCallId, held);
  const saved = store.answerReceipts.insert({ questionId, sessionId: question.sessionId, turnId: question.turnId, toolCallId: question.toolCallId, questionKind: question.kind, answerFingerprint: fingerprint, createdAt: now() });
  return { kind: 'applied', receipt: saved, identity };
}
