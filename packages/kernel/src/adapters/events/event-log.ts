import { streamedEventSchema, type Message, type SseMessage } from '@kvman/protocol';
import type { Connection, SqlRow } from '../../storage/driver.ts';
import { jsonOf } from '../../store/json-order.ts';
import type { StreamedEvent } from './subscriptions.ts';

export type CursorProblem = SseMessage<'resync'>['reason'];

export type LoggedStreamEvent = { seq: number; event: StreamedEvent };

// The events table's fields, the same for a live push and a replay (ADR 0027).
export function streamedEventOf(message: Message): StreamedEvent {
  const { id, type, source, workspaceId, payload, correlationId, causationId, createdAt } = message;
  return {
    id, type, source, payload, correlationId, createdAt,
    ...(workspaceId === undefined ? {} : { workspaceId }), ...(causationId === undefined ? {} : { causationId }),
  };
}

function eventOfRow(row: SqlRow): StreamedEvent {
  const optional = (value: unknown): string | undefined => (value === null || value === undefined ? undefined : String(value));
  const workspaceId = optional(row['workspace_id']);
  const causationId = optional(row['causation_id']);
  return streamedEventSchema.parse({
    id: row['id'], type: row['type'], source: row['source'], payload: jsonOf(row['payload']), correlationId: row['correlation_id'],
    createdAt: row['created_at'], ...(workspaceId === undefined ? {} : { workspaceId }), ...(causationId === undefined ? {} : { causationId }),
  });
}

// The durable events a stream resumes from (12 §12.3): each has its seq, the stream's cursor.
export class EventLog {
  readonly #connection: Connection;

  constructor(connection: Connection) {
    this.#connection = connection;
  }

  newest(): number {
    return Number(this.#connection.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events').get()?.['seq'] ?? 0);
  }

  after(seq: number): LoggedStreamEvent[] {
    return this.#connection.prepare('SELECT * FROM events WHERE seq > ? ORDER BY seq').all(seq).map((row) => ({ seq: Number(row['seq']), event: eventOfRow(row) }));
  }

  // ADR 0098: a cursor ahead of the newest seq is unknown; one whose following events are no longer kept is expired.
  cursorProblem(cursor: number, newest: number): CursorProblem | undefined {
    if (cursor > newest) return 'cursor-unknown';
    if (cursor === newest) return undefined;
    const oldest = this.#connection.prepare('SELECT MIN(seq) AS seq FROM events').get()?.['seq'];
    return oldest === null || oldest === undefined || Number(oldest) > cursor + 1 ? 'cursor-expired' : undefined;
  }

  // The hello message's tray counts (08 §8.11): the tray itself comes with M2.12.
  notifications(): SseMessage<'hello'>['notifications'] {
    const row = this.#connection
      .prepare(`SELECT COUNT(*) AS unread, COALESCE(SUM(attention), 0) AS attention FROM notifications
        WHERE read_at IS NULL AND dismissed_at IS NULL`)
      .get();
    return { unread: Number(row?.['unread'] ?? 0), attention: Number(row?.['attention'] ?? 0) };
  }
}
