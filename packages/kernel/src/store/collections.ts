import type { JsonObject, Stored, TransactionCollection, z } from '@kvman/sdk';
import type { IdGenerator } from '../ids.ts';
import { kernelProblem } from '../problems.ts';
import type { Connection } from '../storage/database.ts';
import { filterSql, findOptions } from './filters.ts';
import { storedText, validationFailed } from './json-values.ts';
import type { ScopeKey } from './kv.ts';

// A collection of JSON documents, checked against its schema on write and parsed on read (ADR 0009, 4).

type Row = { id: string; data: string };

export function collectionOf<Document extends JsonObject>(
  connection: Connection,
  key: ScopeKey,
  name: string,
  schema: z.ZodType<Document>,
  ids: IdGenerator,
): TransactionCollection<Document> {
  const where = 'extension = ? AND scope = ? AND collection = ?';
  const owner = [key.extension, key.scope, name] as const;

  const checked = (value: unknown, what: string): Document => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw validationFailed(what, parsed.error);
    return parsed.data;
  };
  const read = (row: Row): Stored<Document> => {
    const value: unknown = JSON.parse(row.data);
    return { ...checked(value, `The stored document ${name}/${row.id}`), id: row.id };
  };
  const rowOf = (id: string): Row | undefined =>
    connection.prepare<[string, string, string, string], Row>(`SELECT id, data FROM store_documents WHERE ${where} AND id = ?`).get(...owner, id);
  const missing = (id: string): Error => kernelProblem('NOT_FOUND', `There is no document ${name}/${id}.`, { collection: name, id });

  return {
    insert(document) {
      const data = checked(document, `The document for ${name}`);
      const id = ids();
      const text = storedText(data, `The document for ${name}`);
      connection.prepare('INSERT INTO store_documents (extension, scope, collection, id, data) VALUES (?, ?, ?, ?, ?)').run(...owner, id, text);
      return { ...data, id };
    },
    get(id) {
      const row = rowOf(id);
      return row === undefined ? undefined : read(row);
    },
    find(filter, options) {
      const { limit, order } = findOptions(options);
      const condition = filterSql(filter);
      const direction = order === 'asc' ? 'ASC' : 'DESC';
      const sql = `SELECT id, data FROM store_documents WHERE ${where} AND ${condition.sql} ORDER BY id ${direction} LIMIT ?`;
      return connection.prepare<unknown[], Row>(sql).all(...owner, ...condition.values, limit).map(read);
    },
    count(filter) {
      const condition = filterSql(filter);
      const sql = `SELECT count(*) AS total FROM store_documents WHERE ${where} AND ${condition.sql}`;
      return connection.prepare<unknown[], { total: number }>(sql).get(...owner, ...condition.values)?.total ?? 0;
    },
    update(id, patch) {
      const row = rowOf(id);
      if (row === undefined) throw missing(id);
      const current: unknown = JSON.parse(row.data);
      const merged = checked({ ...(typeof current === 'object' ? current : {}), ...patch }, `The document ${name}/${id}`);
      const text = storedText(merged, `The document ${name}/${id}`);
      connection.prepare(`UPDATE store_documents SET data = ? WHERE ${where} AND id = ?`).run(text, ...owner, id);
      return { ...merged, id };
    },
    delete(id) {
      const result = connection.prepare(`DELETE FROM store_documents WHERE ${where} AND id = ?`).run(...owner, id);
      if (result.changes === 0) throw missing(id);
    },
  };
}
