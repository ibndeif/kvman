import type { MessageKind } from '@kvman/protocol';
import type { StoredMessage } from '../storage/commit-unit.ts';
import { StorageFailure, type Connection, type SqlRow } from '../storage/driver.ts';
import { laneKeyOf, priorityOfCode } from '../storage/message-rows.ts';
import { KeylessQueue, LaneQueue, participantOf, type Candidate, type PendingEntry, type RunQueue } from './run-queues.ts';

export type { Candidate, PendingEntry } from './run-queues.ts';

export interface PendingSink {
  add(messages: readonly StoredMessage[]): void;
}

// A command's handler column is its extension; an event delivery's is <extension>|subscription:<pattern> (ADR 0053).
// The handler key names one handler function, which is what concurrency limits and keyless queues count.
export function handlerKeyOf(handler: string, type: string): string {
  return handler.includes('|') ? handler : `${handler}|command:${type}`;
}

function extensionOf(handler: string): string {
  return handler.split('|')[0] ?? handler;
}

function kindOf(value: unknown): MessageKind {
  if (value === 'command' || value === 'event') return value;
  throw new StorageFailure('corrupt', `a pending message has the kind ${String(value)}`);
}

function optionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

function entryOfRow(row: SqlRow): PendingEntry {
  const handler = String(row['handler']);
  const type = String(row['type']);
  const notBefore = optionalNumber(row['not_before']);
  return {
    id: String(row['id']), seq: Number(row['seq']), kind: kindOf(row['kind']), type, handler,
    handlerKey: handlerKeyOf(handler, type), extension: extensionOf(handler),
    workspaceId: row['workspace_id'] === null ? undefined : String(row['workspace_id']),
    laneKey: row['lane'] === null ? undefined : String(row['lane']), priority: priorityOfCode(row['priority']),
    notBefore, deadlineAt: optionalNumber(row['deadline_at']), attempts: Number(row['attempts']),
    runnableSince: Math.max(Number(row['updated_at']), notBefore ?? 0),
  };
}

function entryOf({ message, handler, seq }: StoredMessage, now: number): PendingEntry {
  return {
    id: message.id, seq, kind: message.kind, type: message.type, handler,
    handlerKey: handlerKeyOf(handler, message.type), extension: extensionOf(handler), workspaceId: message.workspaceId,
    laneKey: message.lane === undefined ? undefined : laneKeyOf(handler, message.lane), priority: message.priority,
    notBefore: message.notBefore, deadlineAt: message.deadlineAt, attempts: 0,
    runnableSince: Math.max(now, message.notBefore ?? 0),
  };
}

const rebuildSql = `SELECT id, seq, kind, type, handler, workspace_id, lane, priority, not_before, deadline_at, attempts, updated_at
  FROM messages WHERE state = 'pending' ORDER BY seq`;

// The pending messages the scheduler picks from (03 §3.4): per-lane queues, a keyless queue per handler and
// workspace, and a timer wheel of messages whose notBefore is still ahead. Fed after each commit; rebuilt at boot.
export class PendingIndex implements PendingSink {
  readonly #now: () => number;
  readonly #lanes = new Map<string, LaneQueue>();
  readonly #keyless = new Map<string, KeylessQueue>();
  readonly #timers: PendingEntry[] = [];
  readonly #listeners: Array<() => void> = [];

  constructor(now: () => number) {
    this.#now = now;
  }

  static rebuild(connection: Connection, now: () => number): PendingIndex {
    const index = new PendingIndex(now);
    for (const row of connection.prepare(rebuildSql).all()) index.place(entryOfRow(row));
    return index;
  }

  onAdded(listener: () => void): void {
    this.#listeners.push(listener);
  }

  add(messages: readonly StoredMessage[]): void {
    const now = this.#now();
    for (const stored of messages) if (stored.state === 'pending') this.place(entryOf(stored, now));
    for (const listener of this.#listeners) listener();
  }

  place(entry: PendingEntry): void {
    if (entry.notBefore !== undefined && entry.notBefore > this.#now()) this.#addTimer(entry);
    else this.#placeRunnable(entry);
  }

  // A timer that comes due becomes runnable at its notBefore (ADR 0064).
  promoteDue(now: number): void {
    for (let due = this.#timers[0]; due?.notBefore !== undefined && due.notBefore <= now; due = this.#timers[0]) {
      this.#timers.shift();
      this.#placeRunnable({ ...due, runnableSince: due.notBefore });
    }
  }

  nextDue(): number | undefined {
    return this.#timers[0]?.notBefore;
  }

  candidates(now: number, eligible: (entry: PendingEntry) => boolean): Candidate[] {
    const offered: Candidate[] = [];
    for (const queue of [...this.#lanes.values(), ...this.#keyless.values()]) {
      const candidate = queue.candidate(now, eligible);
      if (candidate !== undefined) offered.push(candidate);
    }
    return offered;
  }

  take(candidate: Candidate): void {
    candidate.queue.take(candidate.entry);
    if (candidate.queue.isEmpty()) this.#forget(candidate.queue);
  }

  laneQueue(laneKey: string): readonly PendingEntry[] {
    return this.#lanes.get(laneKey)?.entries() ?? [];
  }

  keylessQueue(handlerKey: string): readonly PendingEntry[] {
    return [...this.#keyless.values()]
      .filter((queue) => queue.handlerKey === handlerKey)
      .flatMap((queue) => queue.entries())
      .sort((left, right) => left.seq - right.seq);
  }

  laneKeys(): string[] {
    return [...this.#lanes.keys()];
  }

  handlers(): string[] {
    return [...new Set([...this.#keyless.values()].map((queue) => queue.handlerKey))];
  }

  timerWheel(): readonly PendingEntry[] {
    return this.#timers;
  }

  #addTimer(entry: PendingEntry): void {
    const position = this.#timers.findIndex((timer) => (timer.notBefore ?? 0) > (entry.notBefore ?? 0)
      || (timer.notBefore === entry.notBefore && timer.seq > entry.seq));
    this.#timers.splice(position === -1 ? this.#timers.length : position, 0, entry);
  }

  #placeRunnable(entry: PendingEntry): void {
    if (entry.laneKey !== undefined) {
      const lane = this.#lanes.get(entry.laneKey) ?? new LaneQueue(entry.laneKey);
      this.#lanes.set(entry.laneKey, lane);
      lane.place(entry);
      return;
    }
    const key = `${participantOf(entry)}\n${entry.handlerKey}`;
    const queue = this.#keyless.get(key) ?? new KeylessQueue(participantOf(entry), entry.handlerKey);
    this.#keyless.set(key, queue);
    queue.place(entry);
  }

  #forget(queue: RunQueue): void {
    if (queue instanceof LaneQueue) this.#lanes.delete(queue.laneKey);
    if (queue instanceof KeylessQueue) this.#keyless.delete(`${queue.participant}\n${queue.handlerKey}`);
  }
}
