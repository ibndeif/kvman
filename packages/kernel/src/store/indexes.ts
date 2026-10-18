import { createHash } from 'node:crypto';
import type { StoreIndexes } from '@kvman/sdk';
import type { Connection } from '../storage/database.ts';

// Store indexes (plan 02 §2.5, ADR 0088, 3): the field sets extensions declare in `kvman.indexes`, as partial SQLite
// indexes on store_documents that hold each field's JSON type and value. SQLite matches an index expression only when
// the query spells it the same way, with literals, so `typeOf` and `valueOf` build both, and a lookup names its index.

/** One declared index: its extension, its collection, and its fields in order. */
export type StoreIndex = { extension: string; collection: string; fields: readonly string[] };

const namePrefix = 'store_index_';

/** A SQL string literal. */
export function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function fieldPath(field: string): string {
  return sqlText(`$."${field.replaceAll('"', '\\"')}"`);
}

/** The SQL of a field's JSON type. */
export const typeOf = (field: string): string => `json_type(data, ${fieldPath(field)})`;

/** The SQL of a field's JSON value. */
export const valueOf = (field: string): string => `json_extract(data, ${fieldPath(field)})`;

/** The index's SQLite name: the same for the same extension, collection, and fields. */
export function indexName(index: StoreIndex): string {
  const digest = createHash('sha256').update(JSON.stringify([index.extension, index.collection, index.fields])).digest('hex');
  return `${namePrefix}${digest.slice(0, 16)}`;
}

/** Every index the extensions declare. */
export function declaredIndexes(extensions: readonly { name: string; indexes: StoreIndexes | undefined }[]): StoreIndex[] {
  return extensions.flatMap((extension) =>
    Object.entries(extension.indexes ?? {}).flatMap(([collection, indexes]) => indexes.map((fields) => ({ extension: extension.name, collection, fields }))),
  );
}

function createSql(index: StoreIndex): string {
  const columns = index.fields.flatMap((field) => [typeOf(field), valueOf(field)]).join(', ');
  const owner = `extension = ${sqlText(index.extension)} AND collection = ${sqlText(index.collection)}`;
  return `CREATE INDEX IF NOT EXISTS ${indexName(index)} ON store_documents (extension, scope, collection, ${columns}) WHERE ${owner}`;
}

/** Creates the declared indexes that don't exist yet. */
export function createIndexes(connection: Connection, indexes: readonly StoreIndex[]): void {
  connection.transaction(() => {
    for (const index of indexes) connection.exec(createSql(index));
  }).immediate();
}

/** Drops the store indexes that none of `indexes` is; the kernel's other indexes and all data stay. */
export function dropOtherIndexes(connection: Connection, indexes: readonly StoreIndex[]): void {
  const kept = new Set(indexes.map(indexName));
  const existing = connection.prepare<[], { name: string }>(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'store_documents' AND name GLOB '${namePrefix}*'`).all();
  connection.transaction(() => {
    for (const { name } of existing) if (!kept.has(name)) connection.exec(`DROP INDEX "${name.replaceAll('"', '""')}"`);
  }).immediate();
}

/** The fields of the declared index a filter on `fields` uses: the one with exactly its fields, else the one with the
 * most leading fields that are all in it; `undefined` when none starts with one of them. */
export function indexFor(declared: readonly (readonly string[])[], fields: readonly string[]): readonly string[] | undefined {
  const filtered = new Set(fields);
  const exact = declared.find((index) => index.length === filtered.size && index.every((field) => filtered.has(field)));
  if (exact !== undefined) return exact;
  const leading = (index: readonly string[]): number => {
    const outside = index.findIndex((field) => !filtered.has(field));
    return outside === -1 ? index.length : outside;
  };
  return declared.reduce<readonly string[] | undefined>((chosen, index) => (leading(index) > (chosen === undefined ? 0 : leading(chosen)) ? index : chosen), undefined);
}
