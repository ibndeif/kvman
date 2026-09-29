import { unregisteredCodeMessage, type Connection, type KernelRuntime, type LogRecord } from '@kvman/kernel';
import { jsonSchema, type Json, type Message } from '@kvman/protocol';
import { TestkitError } from './testkit-errors.ts';

/** A committed event, as `k.events()` lists it. */
export type RecordedEvent = { type: string; payload: Json; workspaceId?: string };

/** An admitted `ui.*` send, as `k.ui()` lists it. */
export type RecordedUiSend = { type: 'ui.toast' | 'ui.notify' | 'ui.dismiss' | 'ui.navigate'; payload: Json; workspaceId?: string };

const uiTypes: ReadonlyArray<RecordedUiSend['type']> = ['ui.toast', 'ui.notify', 'ui.dismiss', 'ui.navigate'];

function recorded(event: Message): RecordedEvent {
  return { type: event.type, payload: event.payload, ...(event.workspaceId === undefined ? {} : { workspaceId: event.workspaceId }) };
}

// Durable and transient events in commit order, from every runtime the test kernel opened.
export function recordEvents(runtime: KernelRuntime, events: RecordedEvent[]): () => void {
  return runtime.pipeline.observe((applied) => {
    for (const { event } of applied.logged) events.push(recorded(event));
    for (const event of applied.announced) events.push(recorded(event));
  });
}

function isUiType(value: unknown): value is RecordedUiSend['type'] {
  return uiTypes.some((type) => type === value);
}

// ADR 0162: an admitted ui.* send is a done row handled by the kernel.
export function uiSends(connection: Connection): RecordedUiSend[] {
  const rows = connection.prepare(`SELECT type, payload, workspace_id FROM messages WHERE state = 'done' AND type IN (${uiTypes.map(() => '?').join(', ')}) ORDER BY seq`).all(...uiTypes);
  return rows.flatMap((row) => {
    const type = row['type'];
    if (!isUiType(type)) return [];
    const workspaceId = row['workspace_id'];
    return [{ type, payload: jsonSchema.parse(JSON.parse(String(row['payload']))), ...(typeof workspaceId === 'string' ? { workspaceId } : {}) }];
  });
}

function busy(connection: Connection): boolean {
  const row = connection.prepare("SELECT 1 AS found FROM messages WHERE state = 'running' OR (state = 'pending' AND (not_before IS NULL OR not_before <= ?)) LIMIT 1").get(Date.now());
  return row !== undefined;
}

// Resolves once no message is due or running; every commit is a moment the answer can change.
export function untilIdle(runtime: KernelRuntime, connection: Connection): Promise<void> {
  return new Promise((resolve) => {
    const stop = runtime.pipeline.observe(() => {
      if (busy(connection)) return;
      stop();
      resolve();
    });
    if (!busy(connection)) {
      stop();
      resolve();
    }
  });
}

// ADR 0166: the kernel's unregistered-code warnings that no call has reported yet.
export class UnregisteredCodeReports {
  readonly #logged: readonly LogRecord[];
  #reported = 0;

  constructor(logged: readonly LogRecord[]) {
    this.#logged = logged;
  }

  take(): string[] {
    const found = this.#logged.filter((record) => record.message === unregisteredCodeMessage);
    const fresh = found.slice(this.#reported);
    this.#reported = found.length;
    return fresh.map((record) => `${record.attributes.extension ?? '?'} ${String(record.fields['type'])} threw ${String(record.fields['code'])}, which it never registered`);
  }

  error(reports: string[], cause?: unknown): TestkitError {
    const also = cause instanceof Error ? `\n(the call also failed: ${cause.message})` : '';
    return new TestkitError(`unregistered error codes (13 §13.1): register each with ext.registerError\n  ${reports.join('\n  ')}${also}`);
  }
}
