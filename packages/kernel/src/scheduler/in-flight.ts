import type { Message } from '@kvman/protocol';
import type { PendingEntry } from './run-queues.ts';

export type RunningInvocation = { entry: PendingEntry; message: Message; attempt: number; conflicts: number };

function change(counts: Map<string, number>, key: string, by: number): void {
  const next = (counts.get(key) ?? 0) + by;
  if (next === 0) counts.delete(key);
  else counts.set(key, next);
}

// What runs now, and which lanes are held: by a running message, or by a message waiting for its retry backoff so
// the rest of its lane stays behind it (FIFO per lane). A deferred command holds nothing (ADR 0063).
export class InFlight {
  readonly #running = new Map<string, RunningInvocation>();
  readonly #laneHolders = new Map<string, string>();
  readonly #handlers = new Map<string, number>();
  readonly #extensions = new Map<string, number>();

  start(invocation: RunningInvocation): void {
    const { entry } = invocation;
    this.#running.set(entry.id, invocation);
    if (entry.laneKey !== undefined) this.#laneHolders.set(entry.laneKey, entry.id);
    change(this.#handlers, entry.handlerKey, 1);
    change(this.#extensions, entry.extension, 1);
  }

  get(messageId: string): RunningInvocation | undefined {
    return this.#running.get(messageId);
  }

  finish(messageId: string, keepLane: boolean): void {
    const invocation = this.#running.get(messageId);
    if (invocation === undefined) return;
    const { entry } = invocation;
    this.#running.delete(messageId);
    change(this.#handlers, entry.handlerKey, -1);
    change(this.#extensions, entry.extension, -1);
    if (!keepLane && entry.laneKey !== undefined && this.#laneHolders.get(entry.laneKey) === messageId) this.#laneHolders.delete(entry.laneKey);
  }

  holdLane(laneKey: string, messageId: string): void {
    this.#laneHolders.set(laneKey, messageId);
  }

  laneFreeFor(entry: PendingEntry): boolean {
    if (entry.laneKey === undefined) return true;
    const holder = this.#laneHolders.get(entry.laneKey);
    return holder === undefined || holder === entry.id;
  }

  runningHolder(laneKey: string): RunningInvocation | undefined {
    const holder = this.#laneHolders.get(laneKey);
    return holder === undefined ? undefined : this.#running.get(holder);
  }

  handlerCount(handlerKey: string): number {
    return this.#handlers.get(handlerKey) ?? 0;
  }

  extensionCount(extension: string): number {
    return this.#extensions.get(extension) ?? 0;
  }
}
