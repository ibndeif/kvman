import type { NewRecordedValues, RecordedValues } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';
import { inWriteTransaction } from '../storage/write-transaction.ts';

export const noRecordedValues: RecordedValues = { id: [], now: [] };

// ctx.ids.new() and ctx.now() values of a message, stored with the next journaled write (ADR 0070).
export class RecordedValueStore {
  readonly #connection: Connection;

  constructor(connection: Connection) {
    this.#connection = connection;
  }

  load(messageId: string): RecordedValues {
    const rows = this.#connection.prepare('SELECT kind, value FROM recorded_values WHERE message_id = ? ORDER BY kind, n').all(messageId);
    if (rows.length === 0) return noRecordedValues;
    return {
      id: rows.filter((row) => row['kind'] === 'id').map((row) => String(row['value'])),
      now: rows.filter((row) => row['kind'] === 'now').map((row) => Number(row['value'])),
    };
  }

  append(messageId: string, values: NewRecordedValues): void {
    if (values.id.length + values.now.length === 0) return;
    inWriteTransaction(this.#connection, () => {
      const insert = this.#connection.prepare('INSERT INTO recorded_values (message_id, kind, n, value) VALUES (?, ?, ?, ?)');
      for (const { n, value } of values.id) insert.run(messageId, 'id', n, value);
      for (const { n, value } of values.now) insert.run(messageId, 'now', n, String(value));
    });
  }
}
