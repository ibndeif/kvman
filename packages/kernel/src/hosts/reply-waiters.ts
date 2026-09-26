import { replyPayloadSchema, type ReplyPayload } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { FinalReply } from '../storage/commit-unit.ts';
import { storedReplyText, type RowReader } from '../storage/stored-message.ts';
import { jsonOf } from '../store/json-order.ts';

// What a caller learns about a command it waits for: its stored reply, or that its handler deferred it.
export type ReplyListener = { replied(reply: ReplyPayload): void; deferred?(): void };

const finalStates = new Set(['done', 'failed', 'dead']);

function stopping(messageId: string): ReplyPayload {
  return { ok: false, problem: kernelProblem('KERNEL_STOPPING', { correlationId: messageId, messageId }) };
}

// Callers waiting for a command's stored reply (02 §2.3): resolved after the unit that stores it commits. Listeners
// are called synchronously, so an adapter decides in one step where a reply goes (12 §12.3).
export class ReplyWaiters {
  readonly #rows: RowReader;
  readonly #listening = new Map<string, Set<ReplyListener>>();
  #closed = false;

  constructor(rows: RowReader) {
    this.#rows = rows;
  }

  wait(messageId: string): Promise<ReplyPayload> {
    return new Promise((resolve) => {
      this.listen(messageId, { replied: resolve });
    });
  }

  // The listener is registered before the stored state is read, both on the main thread without a pause between
  // them, so a reply committed at any point reaches it exactly once. The returned function stops listening.
  listen(messageId: string, listener: ReplyListener): () => void {
    if (this.#closed) {
      listener.replied(stopping(messageId));
      return () => undefined;
    }
    const listeners = this.#listening.get(messageId) ?? new Set<ReplyListener>();
    listeners.add(listener);
    this.#listening.set(messageId, listeners);
    const stored = this.#storedReply(messageId);
    if (stored !== undefined) this.resolve([{ messageId, reply: stored }]);
    return () => this.#forget(messageId, listener);
  }

  resolve(replies: readonly FinalReply[]): void {
    for (const { messageId, reply } of replies) {
      const listeners = this.#listening.get(messageId) ?? new Set<ReplyListener>();
      this.#listening.delete(messageId);
      for (const listener of listeners) listener.replied(reply);
    }
  }

  // A handler deferred its reply (02 §2.8): the command now waits in `awaiting`.
  deferred(messageId: string): void {
    for (const listener of this.#listening.get(messageId) ?? []) listener.deferred?.();
  }

  // The kernel is stopping: every listener is answered so no call keeps waiting on the database.
  close(): void {
    this.#closed = true;
    this.resolve([...this.#listening.keys()].map((messageId) => ({ messageId, reply: stopping(messageId) })));
  }

  #forget(messageId: string, listener: ReplyListener): void {
    const listeners = this.#listening.get(messageId);
    listeners?.delete(listener);
    if (listeners?.size === 0) this.#listening.delete(messageId);
  }

  #storedReply(messageId: string): ReplyPayload | undefined {
    const row = this.#rows.connection.prepare('SELECT state, result, result_ref FROM messages WHERE id = ?').get(messageId);
    const text = row === undefined ? undefined : storedReplyText(this.#rows.files, row);
    if (row === undefined || !finalStates.has(String(row['state'])) || text === undefined) return undefined;
    return replyPayloadSchema.parse(jsonOf(text));
  }
}
