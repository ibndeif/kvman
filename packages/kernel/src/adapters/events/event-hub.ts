import { protocolVersion, type ReplyPayload, type SubscriptionRequestBody } from '@kvman/protocol';
import type { LiveBus, LiveFrame } from '../../hosts/live-bus.ts';
import type { SchedulerTimers } from '../../scheduler/timers.ts';
import type { CommitPipeline } from '../../storage/commit-pipeline.ts';
import { countTray } from '../../notifications/tray-items.ts';
import type { AppliedMessages, UiPush } from '../../storage/commit-unit.ts';
import type { Connection } from '../../storage/driver.ts';
import type { SpillFiles } from '../../storage/spill.ts';
import { EventLog, streamedEventOf, type LoggedStreamEvent } from './event-log.ts';
import { EventStream } from './event-stream.ts';
import { StreamWriter, type StreamSink } from './stream-writer.ts';
import { matchesEvent, matchesLive, subscriptionOf, type StreamedEvent, type Subscription } from './subscriptions.ts';

export type EventHubDeps = {
  connection: Connection; files: SpillFiles; pipeline: CommitPipeline; live: LiveBus; timers: SchedulerTimers; version: string; now: () => number;
};

// Where a late reply goes: the tab that sent the command (12 §12.3).
export type ReplyTarget = { streamId: string; clientId: string };

export type Subscribed = 'subscribed' | 'not-connected';

// Everything the kernel pushes to people (12 §12.3): committed durable and transient events, live events, late
// replies, and one-way ui.* messages, sent to each stream whose subscriptions match (ui.* to every stream). Durable events carry their seq as the resume cursor; a
// transient event carries the cursor at the time, without an id (ADR 0098).
export class EventHub {
  readonly #deps: EventHubDeps;
  readonly #log: EventLog;
  readonly #streams = new Map<string, EventStream>();
  readonly #unobserve: Array<() => void>;
  #cursor: number;

  constructor(deps: EventHubDeps) {
    this.#deps = deps;
    this.#log = new EventLog(deps);
    this.#cursor = this.#log.newest();
    this.#unobserve = [deps.pipeline.observe((applied) => this.#committed(applied)), deps.live.subscribe((frame) => this.#live(frame))];
  }

  // A connection with a cursor resumes the stream's subscriptions after it, or resyncs (ADR 0098).
  connect(streamId: string, sink: StreamSink, cursor: number | undefined): StreamWriter {
    const stream = this.#streams.get(streamId) ?? new EventStream(streamId, this.#deps.timers, (expired) => this.#streams.delete(expired.id));
    this.#streams.set(streamId, stream);
    const writer = new StreamWriter(sink);
    stream.attach(writer);
    const problem = cursor === undefined ? undefined : this.#log.cursorProblem(cursor, this.#cursor);
    if (problem !== undefined) stream.subscriptions.clear();
    stream.send('hello', {
      userId: 'local', cursor: this.#cursor, protocolVersion, kernelVersion: this.#deps.version,
      subscriptions: [...stream.subscriptions.keys()], notifications: countTray(this.#deps.connection, { workspaceId: undefined, now: this.#deps.now() }),
    });
    if (problem !== undefined) stream.send('resync', { reason: problem });
    else if (cursor !== undefined) this.#replay(stream, [...stream.subscriptions.values()], cursor);
    return writer;
  }

  disconnect(streamId: string, writer: StreamWriter): void {
    this.#streams.get(streamId)?.detach(writer);
  }

  subscribe(request: SubscriptionRequestBody): Subscribed {
    const stream = this.#streams.get(request.stream);
    if (stream === undefined || !stream.connected) return 'not-connected';
    const subscription = subscriptionOf(request);
    stream.subscriptions.set(subscription.sid, subscription);
    for (const address of subscription.live) this.#sendRing(stream, subscription, address);
    if (request.since === undefined) return 'subscribed';
    const problem = this.#log.cursorProblem(request.since, this.#cursor);
    if (problem === undefined) {
      this.#replay(stream, [subscription], request.since);
      return 'subscribed';
    }
    stream.subscriptions.clear();
    stream.send('resync', { reason: problem });
    return 'subscribed';
  }

  unsubscribe(streamId: string, sid: string): void {
    this.#streams.get(streamId)?.subscriptions.delete(sid);
  }

  // A reply that missed its request goes to its tab if the stream is connected; otherwise the shell reads it with
  // GET /messages/:id after reconnecting (ADR 0098).
  reply(target: ReplyTarget, messageId: string, reply: ReplyPayload): void {
    const stream = this.#streams.get(target.streamId);
    const { clientId } = target;
    stream?.send('reply', reply.ok ? { clientId, id: messageId, ok: true, data: reply.value } : { clientId, id: messageId, ok: false, problem: reply.problem });
  }

  // Shutdown (03 §3.9): every connected stream is told, and nothing more is pushed.
  close(): void {
    for (const unobserve of this.#unobserve) unobserve();
    for (const stream of this.#streams.values()) stream.close('shutdown');
    this.#streams.clear();
  }

  #committed(applied: AppliedMessages): void {
    for (const logged of applied.logged) {
      this.#cursor = Math.max(this.#cursor, logged.seq);
      this.#fanOut({ seq: logged.seq, event: streamedEventOf(logged.event) }, true);
    }
    for (const event of applied.announced) this.#fanOut({ seq: this.#cursor, event: streamedEventOf(event) }, false);
    for (const push of applied.pushes) this.#push(push);
  }

  // ADR 0163: a ui.* message goes to every connected stream; its clientId and workspaceId let the shell pick the tabs.
  #push(push: UiPush): void {
    for (const stream of this.#streams.values()) stream.send('ui', push);
  }

  #fanOut(logged: LoggedStreamEvent, durable: boolean): void {
    for (const stream of this.#streams.values()) this.#sendEvent(stream, [...stream.subscriptions.values()], logged, durable);
  }

  #sendEvent(stream: EventStream, subscriptions: readonly Subscription[], { seq, event }: LoggedStreamEvent, durable: boolean): void {
    for (const subscription of subscriptions) {
      if (matchesEvent(subscription, event)) stream.send('event', { sid: subscription.sid, seq, event }, durable ? seq : undefined);
    }
  }

  #replay(stream: EventStream, subscriptions: readonly Subscription[], cursor: number): void {
    if (subscriptions.length === 0) return;
    for (const logged of this.#log.after(cursor)) this.#sendEvent(stream, subscriptions, logged, true);
  }

  #live(frame: LiveFrame): void {
    for (const stream of this.#streams.values()) {
      for (const subscription of stream.subscriptions.values()) {
        if (matchesLive(subscription, frame)) stream.send('live', liveMessage(subscription.sid, frame));
      }
    }
  }

  #sendRing(stream: EventStream, subscription: Subscription, address: string): void {
    const separator = address.indexOf(':');
    for (const frame of this.#deps.live.ring(address.slice(0, separator), address.slice(separator + 1))) {
      if (matchesLive(subscription, frame)) stream.send('live', liveMessage(subscription.sid, frame));
    }
  }
}

function liveMessage(sid: string, frame: LiveFrame): { sid: string; type: string; key: string; run: string; n: number; chunk: LiveFrame['chunk'] } {
  return { sid, type: frame.type, key: frame.key, run: frame.run, n: frame.n, chunk: frame.chunk };
}

export type { StreamedEvent };
