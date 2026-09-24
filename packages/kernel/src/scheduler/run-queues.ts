import type { MessageKind, Priority } from '@kvman/protocol';
import { priorityCodes } from '../storage/message-rows.ts';

export type PendingEntry = {
  id: string;
  seq: number;
  kind: MessageKind;
  type: string;
  handler: string;
  handlerKey: string;
  extension: string;
  workspaceId: string | undefined;
  laneKey: string | undefined;
  priority: Priority;
  notBefore: number | undefined;
  deadlineAt: number | undefined;
  attempts: number;
  runnableSince: number;
};

export const agingMs = 30_000;

// What one queue offers the scheduler this turn. `participant` is the workspace rotation slot ('' for no workspace).
export type Candidate = { entry: PendingEntry; participant: string; queueKey: string; rank: number; queue: RunQueue };

export interface RunQueue {
  readonly key: string;
  candidate(now: number, eligible: (entry: PendingEntry) => boolean): Candidate | undefined;
  take(entry: PendingEntry): void;
  entries(): PendingEntry[];
  isEmpty(): boolean;
}

export function participantOf(entry: PendingEntry): string {
  return entry.workspaceId ?? '';
}

// 02 §2.6, ADR 0064: a background message runnable for 30 s counts as normal.
function effectiveRank(entry: PendingEntry, now: number): number {
  if (entry.priority === 'background' && now - entry.runnableSince >= agingMs) return priorityCodes.normal;
  return priorityCodes[entry.priority];
}

type Order = (left: PendingEntry, right: PendingEntry) => number;

const bySeq: Order = (left, right) => left.seq - right.seq;
const byRunnable: Order = (left, right) => left.runnableSince - right.runnableSince || left.seq - right.seq;

// Entries mostly arrive in order, so the insert point is searched from the tail.
function insertSorted(entries: PendingEntry[], entry: PendingEntry, order: Order): void {
  let index = entries.length;
  for (let previous = entries[index - 1]; previous !== undefined && order(previous, entry) > 0; previous = entries[index - 1]) index -= 1;
  entries.splice(index, 0, entry);
}

function removeFrom(entries: PendingEntry[], entry: PendingEntry): boolean {
  const index = entries.indexOf(entry);
  if (index === -1) return false;
  entries.splice(index, 1);
  return true;
}

function lowerSeq(left: PendingEntry | undefined, right: PendingEntry | undefined): PendingEntry | undefined {
  if (left === undefined || right === undefined) return left ?? right;
  return left.seq < right.seq ? left : right;
}

function offer(queue: RunQueue, entry: PendingEntry, now: number): Candidate {
  return { entry, participant: participantOf(entry), queueKey: queue.key, rank: effectiveRank(entry, now), queue };
}

// A lane runs in order: only its head may run. A retried message keeps its place at the front (FIFO per lane,
// 02 §2.11); everything else joins at the back when it becomes runnable.
export class LaneQueue implements RunQueue {
  readonly key: string;
  readonly laneKey: string;
  readonly #entries: PendingEntry[] = [];

  constructor(laneKey: string) {
    this.laneKey = laneKey;
    this.key = `lane:${laneKey}`;
  }

  place(entry: PendingEntry): void {
    if (entry.attempts > 0) this.#entries.unshift(entry);
    else this.#entries.push(entry);
  }

  candidate(now: number, eligible: (entry: PendingEntry) => boolean): Candidate | undefined {
    const head = this.#entries[0];
    return head !== undefined && eligible(head) ? offer(this, head, now) : undefined;
  }

  take(entry: PendingEntry): void {
    removeFrom(this.#entries, entry);
  }

  entries(): PendingEntry[] {
    return [...this.#entries];
  }

  isEmpty(): boolean {
    return this.#entries.length === 0;
  }
}

// One handler's messages without a lane in one participant: its highest class first, then the lowest seq (ADR 0064).
// Background messages wait in `fresh` (by the time they became runnable) until they have aged into `aged` (by seq).
export class KeylessQueue implements RunQueue {
  readonly key: string;
  readonly participant: string;
  readonly handlerKey: string;
  readonly #interactive: PendingEntry[] = [];
  readonly #normal: PendingEntry[] = [];
  readonly #aged: PendingEntry[] = [];
  readonly #fresh: PendingEntry[] = [];

  constructor(participant: string, handlerKey: string) {
    this.participant = participant;
    this.handlerKey = handlerKey;
    this.key = `keyless:${handlerKey}`;
  }

  place(entry: PendingEntry): void {
    if (entry.priority === 'interactive') insertSorted(this.#interactive, entry, bySeq);
    else if (entry.priority === 'normal') insertSorted(this.#normal, entry, bySeq);
    else insertSorted(this.#fresh, entry, byRunnable);
  }

  candidate(now: number, eligible: (entry: PendingEntry) => boolean): Candidate | undefined {
    this.#age(now);
    const head = this.#interactive[0] ?? lowerSeq(this.#normal[0], this.#aged[0]) ?? this.#fresh[0];
    return head !== undefined && eligible(head) ? offer(this, head, now) : undefined;
  }

  take(entry: PendingEntry): void {
    for (const entries of [this.#interactive, this.#normal, this.#aged, this.#fresh]) if (removeFrom(entries, entry)) return;
  }

  entries(): PendingEntry[] {
    return [...this.#interactive, ...this.#normal, ...this.#aged, ...this.#fresh].sort(bySeq);
  }

  isEmpty(): boolean {
    return this.#interactive.length + this.#normal.length + this.#aged.length + this.#fresh.length === 0;
  }

  #age(now: number): void {
    for (let oldest = this.#fresh[0]; oldest !== undefined && now - oldest.runnableSince >= agingMs; oldest = this.#fresh[0]) {
      this.#fresh.shift();
      insertSorted(this.#aged, oldest, bySeq);
    }
  }
}
