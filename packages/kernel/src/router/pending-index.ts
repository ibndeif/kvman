import type { Priority } from '@kvman/protocol';
import type { StoredMessage } from '../storage/commit-unit.ts';
import { StorageFailure, type Connection, type SqlRow } from '../storage/driver.ts';
import { laneKeyOf, priorityCodes } from '../storage/message-rows.ts';

export type PendingEntry = {
  id: string;
  seq: number;
  handler: string;
  workspaceId: string | undefined;
  laneKey: string | undefined;
  priority: Priority;
  notBefore: number | undefined;
  deadlineAt: number | undefined;
};

export interface PendingSink {
  add(messages: readonly StoredMessage[]): void;
}

const priorityOrder: readonly Priority[] = ['interactive', 'normal', 'background'];

function priorityOf(code: unknown): Priority {
  const priority = priorityOrder.find((candidate) => priorityCodes[candidate] === code);
  if (priority === undefined) throw new StorageFailure('corrupt', `a pending message has the unknown priority code ${String(code)}`);
  return priority;
}

function optionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

function entryOfRow(row: SqlRow): PendingEntry {
  return {
    id: String(row['id']), seq: Number(row['seq']), handler: String(row['handler']),
    workspaceId: row['workspace_id'] === null ? undefined : String(row['workspace_id']),
    laneKey: row['lane'] === null ? undefined : String(row['lane']), priority: priorityOf(row['priority']),
    notBefore: optionalNumber(row['not_before']), deadlineAt: optionalNumber(row['deadline_at']),
  };
}

function entryOf({ message, handler, seq }: StoredMessage): PendingEntry {
  return {
    id: message.id, seq, handler, workspaceId: message.workspaceId,
    laneKey: message.lane === undefined ? undefined : laneKeyOf(handler, message.lane), priority: message.priority,
    notBefore: message.notBefore, deadlineAt: message.deadlineAt,
  };
}

function push(queues: Map<string, PendingEntry[]>, key: string, entry: PendingEntry): void {
  const queue = queues.get(key);
  if (queue === undefined) queues.set(key, [entry]);
  else queue.push(entry);
}

// The pending messages the scheduler picks from (03 §3.4): per-lane queues in seq order, a keyless queue per
// handler, and a timer wheel of messages whose notBefore is still ahead. Fed after each commit; rebuilt at boot.
export class PendingIndex implements PendingSink {
  readonly #now: () => number;
  readonly #lanes = new Map<string, PendingEntry[]>();
  readonly #keyless = new Map<string, PendingEntry[]>();
  readonly #timers: PendingEntry[] = [];

  constructor(now: () => number) {
    this.#now = now;
  }

  static rebuild(connection: Connection, now: () => number): PendingIndex {
    const index = new PendingIndex(now);
    const rows = connection
      .prepare("SELECT id, seq, handler, workspace_id, lane, priority, not_before, deadline_at FROM messages WHERE state = 'pending' ORDER BY seq")
      .all();
    for (const row of rows) index.#place(entryOfRow(row));
    return index;
  }

  add(messages: readonly StoredMessage[]): void {
    for (const stored of messages) if (stored.state === 'pending') this.#place(entryOf(stored));
  }

  laneQueue(laneKey: string): readonly PendingEntry[] {
    return this.#lanes.get(laneKey) ?? [];
  }

  keylessQueue(handler: string): readonly PendingEntry[] {
    return this.#keyless.get(handler) ?? [];
  }

  laneKeys(): string[] {
    return [...this.#lanes.keys()];
  }

  handlers(): string[] {
    return [...this.#keyless.keys()];
  }

  timerWheel(): readonly PendingEntry[] {
    return this.#timers;
  }

  #place(entry: PendingEntry): void {
    if (entry.notBefore !== undefined && entry.notBefore > this.#now()) {
      const position = this.#timers.findIndex((timer) => (timer.notBefore ?? 0) > (entry.notBefore ?? 0)
        || (timer.notBefore === entry.notBefore && timer.seq > entry.seq));
      this.#timers.splice(position === -1 ? this.#timers.length : position, 0, entry);
    } else if (entry.laneKey !== undefined) {
      push(this.#lanes, entry.laneKey, entry);
    } else {
      push(this.#keyless, entry.handler, entry);
    }
  }
}
