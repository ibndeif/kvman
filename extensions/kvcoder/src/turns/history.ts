import type { Stored } from '@kvman/sdk';
import type { JsonValue, MessageDoc, SessionDoc, Source, Usage } from '../schemas/records.ts';
import type { TxRecords } from '../store/collections.ts';
import { now } from '../sessions/session-lookup.ts';

// Appending to a session's history inside a transaction: each message takes the session's next `seq`.

export type NewMessage = {
  kind: MessageDoc['kind'];
  content: Record<string, JsonValue>;
  turnId?: string | null;
  source?: Source | null;
  fileIds?: readonly string[] | null;
  fileNames?: readonly string[] | null;
  model?: string | null;
  usage?: Usage | null;
  durationMs?: number | null;
};

/** Messages are found in blocks of 500 by `seq`, since the store pages only by equality. */
export const blockSize = 500;

export const blockOf = (seq: number): number => Math.floor(seq / blockSize);

export function appendMessage(tx: TxRecords, session: Stored<SessionDoc>, message: NewMessage): Stored<MessageDoc> {
  const fresh = tx.sessions.get(session.id) ?? session;
  tx.sessions.update(session.id, { nextSeq: fresh.nextSeq + 1, updatedAt: now() });
  return tx.messages.insert({
    sessionId: session.id,
    turnId: message.turnId ?? null,
    seq: fresh.nextSeq,
    block: blockOf(fresh.nextSeq),
    kind: message.kind,
    source: message.source ?? null,
    content: message.content,
    fileIds: message.fileIds === undefined || message.fileIds === null ? null : [...message.fileIds],
    fileNames: message.fileNames === undefined || message.fileNames === null ? null : [...message.fileNames],
    model: message.model ?? null,
    usage: message.usage ?? null,
    durationMs: message.durationMs ?? null,
    createdAt: now(),
  });
}

/** A user message's content, as pi-ai has it. */
export function userContent(text: string): Record<string, JsonValue> {
  return { role: 'user', content: text, timestamp: Date.now() };
}

/** Moves the session's queued messages into its history, in the order they came; returns how many moved. */
export function appendQueued(tx: TxRecords, session: Stored<SessionDoc>, turnId: string | null): number {
  const queued = tx.queued.find({ sessionId: session.id }, { limit: 1000 });
  for (const message of queued) {
    tx.queued.delete(message.id);
    appendMessage(tx, session, { kind: 'user', content: userContent(message.text), turnId, source: message.source, fileIds: message.fileIds, fileNames: message.fileNames });
  }
  return queued.length;
}

/** A notice (plan 08 §8.1): kvcoder's own display-only message, shown as `kvcoder.notices.<code>`. */
export function appendNotice(tx: TxRecords, session: Stored<SessionDoc>, code: string, params: Record<string, JsonValue> = {}, turnId: string | null = null): void {
  appendMessage(tx, session, { kind: 'notice', content: { code, params }, turnId });
}

const zero: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

/** No usage yet. */
export const noUsage = (): Usage => ({ ...zero });

export function addUsage(first: Usage, second: Usage): Usage {
  return { input: first.input + second.input, output: first.output + second.output, cacheRead: first.cacheRead + second.cacheRead, cacheWrite: first.cacheWrite + second.cacheWrite, cost: first.cost + second.cost };
}
