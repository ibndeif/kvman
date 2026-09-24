import type { Filter, Json, JsonObject } from '@kvman/protocol';
import type { Connection, SqlValue } from '../storage/driver.ts';
import { scopeCondition } from './collection-indexes.ts';
import { filterSql, orderBySql } from './filter-sql.ts';
import { jsonOf } from './json-order.ts';

export type Versioned<Value> = { value: Value; version: number };
export type StoredDocument = { id: string; data: JsonObject; version: number };
export type StoredLogEntry = { seq: number; value: Json };
export type DocumentQuery = { where: Filter; orderBy: ReadonlyArray<readonly [string, 'asc' | 'desc']>; limit: number | undefined };

function objectOf(text: unknown): JsonObject {
  const value = jsonOf(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('a stored document is not a JSON object');
  return value;
}

export function documentFindStatement(owner: string, ws: string, collection: string, query: DocumentQuery): { sql: string; params: SqlValue[] } {
  const where = filterSql(query.where);
  const limit = query.limit === undefined ? '' : ' LIMIT ?';
  return {
    sql: `SELECT id, data, version FROM docs WHERE ${scopeCondition(owner, collection)} AND ws = ? AND ${where.sql} ORDER BY ${orderBySql(query.orderBy)}${limit}`,
    params: [ws, ...where.params, ...(query.limit === undefined ? [] : [query.limit])],
  };
}

export class StoreReader {
  readonly #connection: Connection;

  constructor(connection: Connection) {
    this.#connection = connection;
  }

  kvGet(owner: string, ws: string, key: string): Versioned<Json> | undefined {
    const row = this.#connection.prepare('SELECT value, version FROM kv WHERE owner = ? AND ws = ? AND key = ?').get(owner, ws, key);
    return row === undefined ? undefined : { value: jsonOf(row['value']), version: Number(row['version']) };
  }

  kvList(owner: string, ws: string, prefix: string, maxRows: number): Array<Versioned<Json> & { key: string }> {
    return this.#connection
      .prepare('SELECT key, value, version FROM kv WHERE owner = ? AND ws = ? AND substr(key, 1, length(?)) = ? ORDER BY key LIMIT ?')
      .all(owner, ws, prefix, prefix, maxRows)
      .map((row) => ({ key: String(row['key']), value: jsonOf(row['value']), version: Number(row['version']) }));
  }

  documentGet(owner: string, ws: string, collection: string, id: string): StoredDocument | undefined {
    const row = this.#connection.prepare('SELECT data, version FROM docs WHERE owner = ? AND ws = ? AND collection = ? AND id = ?').get(owner, ws, collection, id);
    return row === undefined ? undefined : { id, data: objectOf(row['data']), version: Number(row['version']) };
  }

  documentFind(owner: string, ws: string, collection: string, query: DocumentQuery): StoredDocument[] {
    const statement = documentFindStatement(owner, ws, collection, query);
    return this.#connection
      .prepare(statement.sql)
      .all(...statement.params)
      .map((row) => ({ id: String(row['id']), data: objectOf(row['data']), version: Number(row['version']) }));
  }

  documentCount(owner: string, ws: string, collection: string, where: Filter): number {
    const condition = filterSql(where);
    const row = this.#connection.prepare(`SELECT count(*) AS total FROM docs WHERE ${scopeCondition(owner, collection)} AND ws = ? AND ${condition.sql}`).get(ws, ...condition.params);
    return Number(row?.['total'] ?? 0);
  }

  matchingIds(owner: string, ws: string, collection: string, where: Filter, ids: readonly string[]): string[] {
    if (ids.length === 0) return [];
    const condition = filterSql(where);
    const placeholders = ids.map(() => '?').join(', ');
    return this.#connection
      .prepare(`SELECT id FROM docs WHERE ${scopeCondition(owner, collection)} AND ws = ? AND id IN (${placeholders}) AND ${condition.sql}`)
      .all(ws, ...ids, ...condition.params)
      .map((row) => String(row['id']));
  }

  logLastSeq(owner: string, ws: string, log: string): number {
    const row = this.#connection.prepare('SELECT max(seq) AS last FROM logs WHERE owner = ? AND ws = ? AND log = ?').get(owner, ws, log);
    return Number(row?.['last'] ?? 0);
  }

  logRead(owner: string, ws: string, log: string, after: number, before: number, maxRows: number): StoredLogEntry[] {
    return this.#connection
      .prepare('SELECT seq, data FROM logs WHERE owner = ? AND ws = ? AND log = ? AND seq > ? AND seq < ? ORDER BY seq LIMIT ?')
      .all(owner, ws, log, after, before, maxRows)
      .map((row) => ({ seq: Number(row['seq']), value: jsonOf(row['data']) }));
  }

  logReadNewest(owner: string, ws: string, log: string, after: number, before: number, count: number): StoredLogEntry[] {
    return this.#connection
      .prepare('SELECT seq, data FROM logs WHERE owner = ? AND ws = ? AND log = ? AND seq > ? AND seq < ? ORDER BY seq DESC LIMIT ?')
      .all(owner, ws, log, after, before, count)
      .map((row) => ({ seq: Number(row['seq']), value: jsonOf(row['data']) }))
      .reverse();
  }
}
