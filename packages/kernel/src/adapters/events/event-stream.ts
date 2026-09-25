import type { SseMessage, SseMessageName } from '@kvman/protocol';
import type { SchedulerTimers, TimerHandle } from '../../scheduler/timers.ts';
import type { StreamWriter } from './stream-writer.ts';
import type { Subscription } from './subscriptions.ts';

// 12 §12.3: a ping comment every 20 s; subscriptions outlive a disconnect by 5 minutes.
export const streamTimings = { pingMs: 20_000, keepSubscriptionsMs: 5 * 60_000 } as const;

// One browser's stream: its subscriptions, and the connection that currently receives its messages (ADR 0098: the
// newest one).
export class EventStream {
  readonly id: string;
  readonly subscriptions = new Map<string, Subscription>();
  readonly #timers: SchedulerTimers;
  readonly #expired: (stream: EventStream) => void;
  #writer: StreamWriter | undefined;
  #ping: TimerHandle | undefined;
  #expiry: TimerHandle | undefined;

  constructor(id: string, timers: SchedulerTimers, expired: (stream: EventStream) => void) {
    this.id = id;
    this.#timers = timers;
    this.#expired = expired;
  }

  get connected(): boolean {
    return this.#writer !== undefined;
  }

  attach(writer: StreamWriter): void {
    this.#writer?.end();
    this.#ping?.cancel();
    this.#expiry?.cancel();
    this.#expiry = undefined;
    this.#writer = writer;
    this.#schedulePing(writer);
  }

  // Only the current connection's end starts the countdown; a replaced one changes nothing.
  detach(writer: StreamWriter): void {
    if (this.#writer !== writer) return;
    writer.end();
    this.#writer = undefined;
    this.#ping?.cancel();
    this.#expiry = this.#timers.set(streamTimings.keepSubscriptionsMs, () => this.#expired(this));
  }

  send<Name extends SseMessageName>(name: Name, data: SseMessage<Name>, id?: number): void {
    const writer = this.#writer;
    if (writer === undefined) return;
    writer.send(name, data, id === undefined ? {} : { id });
    if (!writer.open) this.detach(writer);
  }

  close(reason: SseMessage<'close'>['reason']): void {
    this.#writer?.close(reason);
    this.#writer = undefined;
    this.#ping?.cancel();
    this.#expiry?.cancel();
  }

  #schedulePing(writer: StreamWriter): void {
    this.#ping = this.#timers.set(streamTimings.pingMs, () => {
      if (this.#writer !== writer) return;
      writer.comment('ping');
      this.#schedulePing(writer);
    });
  }
}
