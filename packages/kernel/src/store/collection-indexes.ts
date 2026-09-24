import { createHash } from 'node:crypto';
import type { Filter } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';
import { fieldExpressions, sqlLiteral } from './sql-paths.ts';

export type CollectionDeclaration = { name: string; idField: string; indexes: ReadonlyArray<readonly string[]> };

export function scopeCondition(owner: string, collection: string): string {
  return `owner = ${sqlLiteral(owner)} AND collection = ${sqlLiteral(collection)}`;
}

function indexName(owner: string, collection: string, fields: readonly string[]): string {
  return `docs_${createHash('sha256').update(JSON.stringify([owner, collection, fields])).digest('hex').slice(0, 24)}`;
}

export function createCollectionIndexes(connection: Connection, owner: string, collection: CollectionDeclaration): void {
  for (const fields of collection.indexes) {
    const expressions = fields.map((field) => fieldExpressions(field).value).join(', ');
    connection.exec(`CREATE INDEX IF NOT EXISTS ${indexName(owner, collection.name, fields)} ON docs (ws, ${expressions}) WHERE ${scopeCondition(owner, collection.name)}`);
  }
}

export function isIndexedQuery(collection: CollectionDeclaration, where: Filter, orderBy: ReadonlyArray<readonly [string, string]>, limit: number | undefined): boolean {
  const leadingFields = collection.indexes.flatMap((fields) => fields.slice(0, 1));
  const constrained = Object.entries(where).some(([path, condition]) => path !== '$or' && condition !== undefined && leadingFields.includes(path));
  const firstOrder = orderBy[0]?.[0];
  return constrained || (limit !== undefined && firstOrder !== undefined && leadingFields.includes(firstOrder));
}
