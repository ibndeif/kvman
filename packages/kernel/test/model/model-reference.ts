import { jsonObjectSchema, replyPayloadSchema, type Json, type ReplyPayload } from '@kvman/protocol';
import { expect } from 'vitest';
import { continuationType, freeType, laneType, type ModelKernel } from './model-kernel.ts';

// The reference model of ADR 0102: what each message of the sequence must be, and the rules every step keeps.

export type ModelState = 'pending' | 'running' | 'awaiting' | 'done' | 'failed' | 'dead' | 'cancelled';

export type Expected = {
  id: string;
  seq: number;
  type: string;
  lane: string | undefined;
  state: ModelState;
  attempts: number;
  reply: ReplyPayload | undefined;
  onReply: boolean;
  // The message whose unit stored this one; cancel scopes follow it (ADR 0083).
  parent: string | undefined;
};

export const maxAttempts = 3;
const handlerConcurrency = 16;
const finalStates = new Set<ModelState>(['done', 'failed', 'dead', 'cancelled']);
const modelTypes = [laneType, freeType, continuationType];

type Row = Record<string, unknown>;

function rowOf(kernel: ModelKernel, id: string): Row {
  const row = kernel.connection.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (row === undefined) throw new Error(`no row ${id}`);
  return row;
}

function resultOf(row: Row): ReplyPayload | undefined {
  return row['result'] === null ? undefined : replyPayloadSchema.parse(JSON.parse(String(row['result'])));
}

export class Reference {
  readonly messages = new Map<string, Expected>();
  claimsSeen = 0;

  bySeq(filter: (message: Expected) => boolean): Expected[] {
    return [...this.messages.values()].filter(filter).sort((left, right) => left.seq - right.seq);
  }

  // A message the kernel stored, read back by id or by its derived idempotency key.
  add(kernel: ModelKernel, id: string, parent: string | undefined): Expected {
    const row = rowOf(kernel, id);
    const { lane } = jsonObjectSchema.parse(JSON.parse(String(row['payload'])));
    const expected: Expected = {
      id, seq: Number(row['seq']), type: String(row['type']), lane: row['type'] === laneType && typeof lane === 'string' ? lane : undefined, state: 'pending', attempts: 0,
      reply: undefined, onReply: row['on_reply'] !== null, parent,
    };
    this.messages.set(id, expected);
    return expected;
  }

  addByKey(kernel: ModelKernel, key: string, parent: string | undefined): Expected {
    const row = kernel.connection.prepare('SELECT id FROM messages WHERE idempotency_key = ?').get(key);
    if (row === undefined) throw new Error(`no message with key ${key}`);
    return this.add(kernel, String(row['id']), parent);
  }

  // A command that becomes final delivers its reply once to its continuation, which the command caused (02 §2.8).
  finish(kernel: ModelKernel, message: Expected, state: ModelState, reply: ReplyPayload): void {
    message.state = state;
    message.reply = reply;
    if (message.onReply) this.addByKey(kernel, `${message.id}:reply`, message.id);
  }

  // A crash (ADR 0091): every running message counts an attempt, and at maxAttempts it is dead.
  crashed(kernel: ModelKernel): void {
    for (const message of this.bySeq((candidate) => candidate.state === 'running')) {
      message.attempts += 1;
      if (message.attempts < maxAttempts) message.state = 'pending';
      else this.finish(kernel, message, 'dead', { ok: false, problem: { code: 'MESSAGE_DEAD', title: '', retryable: false, correlationId: message.id } });
    }
    this.claimsSeen = 0;
  }

  // The claims the scheduler made since the last step: each one is legal for its lane and its attempt.
  observeClaims(kernel: ModelKernel): void {
    for (const claim of kernel.dispatcher.claims.slice(this.claimsSeen)) {
      const message = this.messages.get(claim.message.id);
      expect(message, `claimed ${claim.message.type} ${claim.message.id} unknown to the model`).toBeDefined();
      if (message === undefined) continue;
      expect(message.state, `${message.id} claimed`).toBe('pending');
      expect(claim.attempt, `${message.id} attempt`).toBe(message.attempts + 1);
      if (message.lane !== undefined) {
        const ahead = this.bySeq((other) => other.lane === message.lane && other.seq < message.seq && (other.state === 'pending' || other.state === 'running'));
        expect(ahead.map((other) => other.id), `${message.id} started while its lane had earlier work`).toEqual([]);
      }
      message.state = 'running';
    }
    this.claimsSeen = kernel.dispatcher.claims.length;
  }

  verify(kernel: ModelKernel): void {
    this.observeClaims(kernel);
    this.#compareRows(kernel);
    for (const lane of new Set(this.bySeq((message) => message.lane !== undefined).map((message) => message.lane))) {
      expect(this.bySeq((message) => message.lane === lane && message.state === 'running').length, `running in lane ${String(lane)}`).toBeLessThanOrEqual(1);
    }
    this.#checkContinuations(kernel);
    this.#checkNothingStuck(kernel);
  }

  #compareRows(kernel: ModelKernel): void {
    const placeholders = modelTypes.map(() => '?').join(', ');
    const stored = kernel.connection.prepare(`SELECT id FROM messages WHERE type IN (${placeholders})`).all(...modelTypes).map((row) => String(row['id']));
    expect(stored.sort()).toEqual([...this.messages.keys()].sort());
    for (const message of this.messages.values()) {
      const row = rowOf(kernel, message.id);
      expect({ state: row['state'], attempts: row['attempts'] }, message.id).toEqual({ state: message.state, attempts: message.attempts });
      const result = resultOf(row);
      if (!finalStates.has(message.state)) expect(result, `${message.id} has no reply yet`).toBeUndefined();
      else if (message.reply?.ok === true) expect(result, message.id).toEqual(message.reply);
      else expect(result?.ok === false ? result.problem.code : 'no problem', message.id).toBe(message.reply?.ok === false ? message.reply.problem.code : '');
    }
  }

  #checkContinuations(kernel: ModelKernel): void {
    for (const message of this.messages.values()) {
      if (!message.onReply) continue;
      const delivered = kernel.connection.prepare('SELECT payload FROM messages WHERE idempotency_key = ?').all(`${message.id}:reply`);
      expect(delivered.length, `continuations of ${message.id}`).toBe(finalStates.has(message.state) ? 1 : 0);
      const [continuation] = delivered;
      if (continuation === undefined) continue;
      const reply = replyPayloadSchema.parse(jsonObjectSchema.parse(JSON.parse(String(continuation['payload'])))['reply']);
      expect(reply.ok, `continuation of ${message.id}`).toBe(message.reply?.ok);
    }
  }

  // Liveness: once the kernel is quiet, a runnable message whose lane is free and whose handler has room was claimed.
  #checkNothingStuck(kernel: ModelKernel): void {
    const now = kernel.time.value;
    for (const message of this.bySeq((candidate) => candidate.state === 'pending')) {
      const notBefore = rowOf(kernel, message.id)['not_before'];
      if (typeof notBefore === 'number' && notBefore > now) continue;
      const running = this.bySeq((other) => other.type === message.type && other.state === 'running').length;
      if (running >= handlerConcurrency) continue;
      if (message.lane !== undefined && this.bySeq((other) => other.lane === message.lane && other.seq < message.seq && !finalStates.has(other.state) && other.state !== 'awaiting').length > 0) continue;
      expect.fail(`${message.type} ${message.id} is runnable but was not claimed`);
    }
  }
}

export function valueOf(id: string): Json {
  return { by: id };
}
