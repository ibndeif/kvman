import { placeholderTitle } from '../sessions/placeholder-title.ts';
import type { Ctx, File, Stored } from '@kvman/sdk';
import { dismissedText } from '../connectors/ask.ts';
import { reportInterrupted } from '../jobs/process-report.ts';
import { invalid } from '../problems.ts';
import type { SessionDoc, Source } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords } from '../store/collections.ts';
import { runningInBackground } from '../jobs/job-rows.ts';
import { appendMessage, userContent } from '../turns/history.ts';
import { modelInfo } from '../turns/model-info.ts';
import { recoverSession, recoverWorkspace } from '../turns/recover-workspace.ts';
import { heldText } from '../turns/resolve.ts';
import { beginTurn, dispatchStep, openTurn } from '../turns/start-turn.ts';
import { prepareStep } from '../turns/step-intents.ts';
import { saveAttachments, withAttachments } from './attachments.ts';
import { acknowledged, sentBy } from './send-receipt.ts';

// A message from the person or an extension (plan 08 §8.1): on an idle session it starts a turn; on a running one it
// waits for the step's results; on a waiting one it dismisses the pending questions and denies the approvals, and the
// next step runs once no subagent is left to wait for (ADR 0009, 90).

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** A message's files: its images, which the session's model must take (ADR 0009, 103), and every other file (ADR 0018, 2). */
export async function sortedFiles(ctx: Ctx, session: Stored<SessionDoc>, fileIds: readonly string[]): Promise<{ images: File[]; others: File[] }> {
  const files = await Promise.all(fileIds.map((fileId) => ctx.files.get(fileId)));
  const images = files.filter((file) => imageTypes.has(file.type));
  if (images.length > 0 && (await modelInfo(ctx, session.model))?.images !== true) throw invalid(`The model ${session.model ?? '(none)'} doesn't take images.`, { model: session.model });
  return { images, others: files.filter((file) => !imageTypes.has(file.type)) };
}

export type Incoming = { text: string; fileIds: readonly string[]; source: Source; mayStart: boolean; sendId?: string | undefined };

export async function receiveMessage(ctx: Ctx, session: Stored<SessionDoc>, incoming: Incoming, recover = false): Promise<void> {
  const sent = incoming.sendId === undefined ? undefined : sentBy(incoming.sendId, session.id, incoming.text, incoming.fileIds);
  // Before any file work: an accepted send has already moved its uploads into the workspace (ADR 0048, 4).
  if (sent !== undefined && acknowledged((await records(ctx.store).sendReceipts.find({ sendId: sent.sendId }, { limit: 1 }))[0], sent)) return;
  await reportInterrupted(ctx, session.id);
  const { images, others } = await sortedFiles(ctx, session, incoming.fileIds);
  const text = withAttachments(incoming.text, await saveAttachments(ctx, others));
  const files = images.length === 0 ? { fileIds: null, fileNames: null } : { fileIds: images.map((file) => file.id), fileNames: images.map((file) => file.name) };
  if (recover) await recoverWorkspace(ctx, session.id);
  // What still runs is told with the person's message, and stored with it so what is sent never changes (ADR 0068, 4).
  const running = incoming.source.kind === 'user' ? await runningInBackground(ctx, session.id) : [];
  const next = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const fresh = store.sessions.get(session.id);
    if (fresh === undefined) throw ctx.problem('kvcoder/SESSION_NOT_FOUND', { sessionId: session.id });
    if (sent !== undefined) {
      if (acknowledged(store.sendReceipts.find({ sendId: sent.sendId }, { limit: 1 })[0], sent)) return undefined;
      store.sendReceipts.insert({ ...sent, createdAt: now() });
    }
    if (fresh.status === 'idle') {
      if (fresh.autoTitle && fresh.title === '') store.sessions.update(fresh.id, { title: placeholderTitle(incoming.text) });
      appendMessage(store, fresh, { kind: 'user', content: userContent(text, running), source: incoming.source, ...files });
      return incoming.mayStart ? { start: openTurn(store, fresh) } : {};
    }
    store.queued.insert({ sessionId: fresh.id, source: incoming.source, text, ...(running.length === 0 ? {} : { running }), ...files, createdAt: now() });
    const turn = fresh.turnId === null ? undefined : store.turns.get(fresh.turnId);
    if (fresh.status === 'running' || !incoming.mayStart || turn === undefined) return {};
    const dismissed = turn.pending.filter((item) => item.questionId !== null);
    const results = dismissed.map((item) => {
      const question = item.questionId === null ? undefined : store.questions.get(item.questionId);
      if (question !== undefined) store.questions.delete(question.id);
      return heldText(item.toolCallId, dismissedText(question?.kind ?? 'text'), true);
    });
    const pending = turn.pending.filter((item) => item.questionId === null);
    // What was held back behind those approvals is settled too, and never run (ADR 0046, amendment 5).
    const skipped = turn.deferredCalls.map((item) => heldText(item.toolCallId, 'not run: the person sent a message instead of deciding the earlier call', true));
    store.turns.update(turn.id, { pending, results: [...turn.results, ...results, ...skipped], deferredCalls: [] });
    if (pending.length > 0) return {};
    store.sessions.update(fresh.id, { status: 'running', updatedAt: now() });
    return { resume: prepareStep(store, fresh.id, turn.id) };
  });
  if (next === undefined) return;
  if (next.start !== undefined) await beginTurn(ctx, session.id, next.start, true);
  if (next.resume !== undefined) await dispatchStep(ctx, next.resume, true);
  if (recover) await recoverSession(ctx, session.id);
}
