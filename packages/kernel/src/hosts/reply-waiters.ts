import { replyPayloadSchema, type ReplyPayload } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { FinalReply } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import { jsonOf } from '../store/json-order.ts';

type Resolve = (reply: ReplyPayload) => void;

const finalStates = new Set(['done', 'failed', 'dead']);

function stopping(messageId: string): ReplyPayload {
  return { ok: false, problem: kernelProblem('INTERNAL', { correlationId: messageId, messageId, detail: 'the kernel is stopping' }) };
}

// Callers waiting for a command's stored reply (02 §2.3): resolved after the unit that stores it commits.
export class ReplyWaiters {
  readonly #connection: Connection;
  readonly #waiting = new Map<string, Resolve[]>();
  #closed = false;

  constructor(connection: Connection) {
    this.#connection = connection;
  }

  // The waiter is registered before the stored state is read, both on the main thread without a pause between them,
  // so a reply committed at any point reaches it exactly once.
  wait(messageId: string): Promise<ReplyPayload> {
    if (this.#closed) return Promise.resolve(stopping(messageId));
    return new Promise((resolve) => {
      this.#waiting.set(messageId, [...(this.#waiting.get(messageId) ?? []), resolve]);
      const stored = this.#storedReply(messageId);
      if (stored !== undefined) this.resolve([{ messageId, reply: stored }]);
    });
  }

  resolve(replies: readonly FinalReply[]): void {
    for (const { messageId, reply } of replies) {
      const waiting = this.#waiting.get(messageId) ?? [];
      this.#waiting.delete(messageId);
      for (const resolve of waiting) resolve(reply);
    }
  }

  // The kernel is stopping: every waiter is answered so no call keeps waiting on the database.
  close(): void {
    this.#closed = true;
    this.resolve([...this.#waiting.keys()].map((messageId) => ({ messageId, reply: stopping(messageId) })));
  }

  #storedReply(messageId: string): ReplyPayload | undefined {
    const row = this.#connection.prepare('SELECT state, result FROM messages WHERE id = ?').get(messageId);
    if (row === undefined || !finalStates.has(String(row['state'])) || row['result'] === null) return undefined;
    return replyPayloadSchema.parse(jsonOf(row['result']));
  }
}
