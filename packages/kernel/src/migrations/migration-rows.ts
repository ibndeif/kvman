import { jsonObjectSchema, type Json, type Manifest, type MigrationCursor, type MigrationData, type MigrationRows, type Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { Connection, SqlValue } from '../storage/driver.ts';

export const migrationBatchRows = 256;

export type RowsRequest = { data: MigrationData; collection?: string; log?: string; after?: MigrationCursor };

export type RowsAnswer = { ok: true; rows: MigrationRows } | { ok: false; problem: Problem };

type Query = { sql: string; parameters: SqlValue[]; key: readonly string[] };

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function workspaceOf(ws: unknown): string | null {
  return ws === '' ? null : String(ws);
}

function parsed(text: unknown): Json {
  const value: Json = JSON.parse(String(text));
  return value;
}

// The rows of one kind of the extension's data, global ('' sorts first) then workspaces by id, then by key, id, or
// log and seq; a cursor continues after the last row of the previous batch.
function queryOf(owner: string, request: RowsRequest): Query {
  if (request.data === 'kv') return { sql: 'SELECT ws, key, value FROM kv WHERE owner = ?', parameters: [owner], key: ['ws', 'key'] };
  if (request.data === 'docs') {
    return { sql: 'SELECT ws, id, data FROM docs WHERE owner = ? AND collection = ?', parameters: [owner, request.collection ?? ''], key: ['ws', 'id'] };
  }
  const log = request.log ?? '';
  const family = log.endsWith(':*');
  const filter = family ? "log LIKE ? ESCAPE '\\'" : 'log = ?';
  return { sql: `SELECT ws, log, seq, data FROM logs WHERE owner = ? AND ${filter}`, parameters: [owner, family ? `${escapeLike(log.slice(0, -1))}%` : log], key: ['ws', 'log', 'seq'] };
}

function registrationProblem(manifest: Manifest, request: RowsRequest, correlationId: string): Problem | undefined {
  if (request.data === 'docs' && !manifest.data.collections.some((collection) => collection.name === request.collection)) {
    return kernelProblem('VALIDATION_FAILED', { correlationId, detail: `${manifest.meta.name} registers no collection "${request.collection ?? ''}"` });
  }
  if (request.data === 'logs' && !manifest.data.logs.some((log) => log.prefix === request.log)) {
    return kernelProblem('VALIDATION_FAILED', { correlationId, detail: `${manifest.meta.name} registers no log "${request.log ?? ''}"` });
  }
  return undefined;
}

// 04 §4.8, ADR 0143: one batch of the migrating extension's own rows, never another owner's.
export function readMigrationRows(connection: Connection, manifest: Manifest, request: RowsRequest, correlationId: string, batchRows = migrationBatchRows): RowsAnswer {
  const problem = registrationProblem(manifest, request, correlationId);
  if (problem !== undefined) return { ok: false, problem };
  const query = queryOf(manifest.meta.name, request);
  const columns = query.key.join(', ');
  const after = request.after;
  const position = after === undefined ? '' : ` AND (${columns}) > (${query.key.map(() => '?').join(', ')})`;
  const rows = connection.prepare(`${query.sql}${position} ORDER BY ${columns} LIMIT ?`).all(...query.parameters, ...(after ?? []), batchRows);
  const answered = rows.map((row) => {
    const workspaceId = workspaceOf(row['ws']);
    if (request.data === 'kv') return { workspaceId, key: String(row['key']), value: parsed(row['value']) };
    if (request.data === 'docs') return { workspaceId, id: String(row['id']), doc: jsonObjectSchema.parse(parsed(row['data'])) };
    return { workspaceId, log: String(row['log']), seq: Number(row['seq']), value: parsed(row['data']) };
  });
  const last = rows.at(-1);
  const next: MigrationCursor | undefined = rows.length < batchRows || last === undefined
    ? undefined
    : query.key.map((column) => (column === 'seq' ? Number(last[column]) : String(last[column])));
  return { ok: true, rows: { rows: answered, ...(next === undefined ? {} : { next }) } };
}
