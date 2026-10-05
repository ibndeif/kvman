import type { Ctx, Stored } from '@kvman/sdk';
import { dismissedText } from '../connectors/ask.ts';
import { reportInterrupted } from '../jobs/process-report.ts';
import { invalid } from '../problems.ts';
import type { SessionDoc, Source } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords } from '../store/collections.ts';
import { appendMessage, userContent } from '../turns/history.ts';
import { modelInfo } from '../turns/model-info.ts';
import { heldText } from '../turns/resolve.ts';
import { beginTurn, openTurn, queueStep } from '../turns/start-turn.ts';

// A message from the person or an extension (plan 08 §8.1): on an idle session it starts a turn; on a running one it
// waits for the step's results; on a waiting one it dismisses the pending questions and denies the approvals, and the
// next step runs once no subagent is left to wait for (ADR 0009, 90).

const imageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** The attached files' names, after checking they are images the session's model takes (ADR 0009, 103). */
export async function checkedFiles(ctx: Ctx, session: Stored<SessionDoc>, fileIds: readonly string[]): Promise<string[]> {
  if (fileIds.length === 0) return [];
  const files = await Promise.all(fileIds.map((fileId) => ctx.files.get(fileId)));
  const other = files.find((file) => !imageTypes.has(file.type));
  if (other !== undefined) throw invalid(`${other.name} isn't a PNG, JPEG, GIF, or WebP image.`, { fileId: other.id });
  if ((await modelInfo(ctx, session.model))?.images !== true) throw invalid(`The model ${session.model ?? '(none)'} doesn't take images.`, { model: session.model });
  return files.map((file) => file.name);
}

export type Incoming = { text: string; fileIds: readonly string[]; source: Source; mayStart: boolean };

export async function receiveMessage(ctx: Ctx, session: Stored<SessionDoc>, incoming: Incoming): Promise<void> {
  await reportInterrupted(ctx, session.id);
  const fileNames = await checkedFiles(ctx, session, incoming.fileIds);
  const files = incoming.fileIds.length === 0 ? { fileIds: null, fileNames: null } : { fileIds: [...incoming.fileIds], fileNames };
  const next = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const fresh = store.sessions.get(session.id) ?? session;
    if (fresh.status === 'idle') {
      if (fresh.autoTitle && fresh.title === '') store.sessions.update(fresh.id, { title: incoming.text.slice(0, 60) });
      appendMessage(store, fresh, { kind: 'user', content: userContent(incoming.text), source: incoming.source, ...files });
      return incoming.mayStart ? { start: openTurn(store, fresh) } : {};
    }
    store.queued.insert({ sessionId: fresh.id, source: incoming.source, text: incoming.text, ...files, createdAt: now() });
    const turn = fresh.turnId === null ? undefined : store.turns.get(fresh.turnId);
    if (fresh.status === 'running' || !incoming.mayStart || turn === undefined) return {};
    const dismissed = turn.pending.filter((item) => item.questionId !== null);
    const results = dismissed.map((item) => {
      const question = item.questionId === null ? undefined : store.questions.get(item.questionId);
      if (question !== undefined) store.questions.delete(question.id);
      return heldText(item.toolCallId, dismissedText(question?.kind ?? 'text'), true);
    });
    const pending = turn.pending.filter((item) => item.questionId === null);
    store.turns.update(turn.id, { pending, results: [...turn.results, ...results] });
    if (pending.length > 0) return {};
    store.sessions.update(fresh.id, { status: 'running', updatedAt: now() });
    return { resume: turn.id };
  });
  if (next.start !== undefined) await beginTurn(ctx, session.id, next.start, true);
  if (next.resume !== undefined) await queueStep(ctx, session.id, next.resume, true);
}
