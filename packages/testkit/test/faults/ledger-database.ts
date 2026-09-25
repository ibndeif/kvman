import { join } from 'node:path';
import { betterSqlite3Driver, openKernelDatabase, type Connection } from '@kvman/kernel';
import { jsonSchema, replyPayloadSchema, type Json, type ReplyPayload } from '@kvman/protocol';
import { z } from 'zod';

// Reads of a fixture kernel's database file while no kernel runs on it.

export type MessageRow = {
  id: string; seq: number; type: string; state: string; attempts: number; payload: Json; result: ReplyPayload | undefined;
  idempotencyKey: string | undefined;
};


const inspectionId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';

export function inspect<Result>(home: string, read: (connection: Connection) => Result): Result {
  const connection = openKernelDatabase(join(home, 'kvman.db'), betterSqlite3Driver, inspectionId);
  try {
    return read(connection);
  } finally {
    connection.close();
  }
}

const postingSchema = z.object({ account: z.string(), n: z.number().int(), messageId: z.string() });

function parsed(value: unknown): Json {
  return jsonSchema.parse(JSON.parse(String(value)));
}

export function messagesOf(connection: Connection, type: string): MessageRow[] {
  const found = connection.prepare('SELECT id, seq, type, state, attempts, payload, result, idempotency_key FROM messages WHERE type = ? ORDER BY seq').all(type);
  return found.map((row) => ({
    id: String(row['id']), seq: Number(row['seq']), type: String(row['type']), state: String(row['state']), attempts: Number(row['attempts']),
    payload: parsed(row['payload']), result: row['result'] === null ? undefined : replyPayloadSchema.parse(parsed(row['result'])),
    idempotencyKey: row['idempotency_key'] === null ? undefined : String(row['idempotency_key']),
  }));
}

export function messageOf(connection: Connection, id: string): MessageRow {
  const type = connection.prepare('SELECT type FROM messages WHERE id = ?').get(id)?.['type'];
  const found = messagesOf(connection, String(type)).find((row) => row.id === id);
  if (found === undefined) throw new Error(`no message ${id}`);
  return found;
}

export type Posting = z.infer<typeof postingSchema>;

export function postings(connection: Connection): Posting[] {
  return connection.prepare("SELECT data FROM logs WHERE owner = '@acme/ledger' AND log LIKE 'postings:%' ORDER BY log, seq").all().map((row) => postingSchema.parse(parsed(row['data'])));
}

export function balanceOf(connection: Connection, account: string): Json | undefined {
  const found = connection.prepare("SELECT value FROM kv WHERE owner = '@acme/ledger' AND key = ?").get(`balance:${account}`);
  return found === undefined ? undefined : parsed(found['value']);
}

export function countOf(connection: Connection, sql: string, ...values: string[]): number {
  return Number(connection.prepare(sql).get(...values)?.['count']);
}

export type StepRow = { messageId: string; name: string; state: string; retrySafe: boolean };

export function steps(connection: Connection): StepRow[] {
  return connection.prepare('SELECT message_id, name, state, retry_safe FROM steps ORDER BY message_id, name').all().map((row) => ({
    messageId: String(row['message_id']), name: String(row['name']), state: String(row['state']), retrySafe: row['retry_safe'] === 1,
  }));
}

export function runningLedgerMessages(connection: Connection): MessageRow[] {
  const types = connection.prepare("SELECT DISTINCT type FROM messages WHERE type LIKE 'ledger.%' AND state = 'running'").all();
  return types.flatMap((row) => messagesOf(connection, String(row['type'])).filter((message) => message.state === 'running'));
}

// The account a posting's payload names.
export function accountOf(message: MessageRow): string {
  const { payload } = message;
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload) && typeof payload['account'] === 'string' ? payload['account'] : '';
}
