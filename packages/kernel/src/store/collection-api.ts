import { applyMergePatch, filterSchema, jsonByteLength, matchesDocument, type Filter, type Json, type JsonObject } from '@kvman/protocol';
import type { Collection, FindQuery, OrderBy } from '@kvman/sdk';
import { isIndexedQuery, type CollectionDeclaration } from './collection-indexes.ts';
import { compareDocuments } from './json-order.ts';
import { UnsupportedFieldName } from './sql-paths.ts';
import { requireWritable, storeFailure, storeLimits, tooLarge, type ScopeBinding, type StoreContext } from './store-context.ts';

type CheckedQuery = { where: Filter; orderBy: OrderBy; limit: number | undefined };

function checkedQuery(context: StoreContext, query: FindQuery): CheckedQuery {
  const where = filterSchema.safeParse(query.where ?? {});
  if (!where.success) {
    throw storeFailure(context, 'VALIDATION_FAILED', { issues: where.error.issues.map((issue) => ({ path: `where.${issue.path.join('.')}`, message: issue.message })) });
  }
  if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 1)) {
    throw storeFailure(context, 'VALIDATION_FAILED', { issues: [{ path: 'limit', message: 'limit is a positive integer' }] });
  }
  return { where: where.data, orderBy: query.orderBy ?? [], limit: query.limit };
}

function objectOf(value: Json): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function withSqlErrors<Result>(context: StoreContext, read: () => Result): Result {
  try {
    return read();
  } catch (error) {
    if (error instanceof UnsupportedFieldName) throw storeFailure(context, 'VALIDATION_FAILED', { detail: error.message });
    throw error;
  }
}

export function createCollection(binding: ScopeBinding, declaration: CollectionDeclaration): Collection {
  const { context, scope, ws } = binding;
  const { reader, pending, owner } = context;
  const name = declaration.name;

  const idOf = (document: JsonObject): string => {
    const id = document[declaration.idField];
    if (typeof id !== 'string' || id === '') {
      throw storeFailure(context, 'VALIDATION_FAILED', { issues: [{ path: declaration.idField, message: `the id field "${declaration.idField}" is a non-empty string` }] });
    }
    return id;
  };
  const validate = (document: JsonObject): void => {
    const issues = context.validateDocument(name, document);
    if (issues.length > 0) throw storeFailure(context, 'VALIDATION_FAILED', { issues });
  };
  const guardScan = (query: CheckedQuery): void => {
    if (isIndexedQuery(declaration, query.where, query.orderBy, query.limit)) return;
    if (reader.documentCount(owner, ws, name, {}) > storeLimits.unindexedScanRows) {
      throw storeFailure(context, 'STORE_RESULT_TOO_LARGE', { detail: `an unindexed read of ${name} scans more than ${storeLimits.unindexedScanRows} documents`, hint: 'add an index or filter on an indexed field' });
    }
    context.unindexedScans.note({ owner, collection: name, shape: JSON.stringify([Object.keys(query.where).sort(), query.orderBy.map(([field]) => field)]) });
  };

  return {
    async get(id) {
      const buffered = pending.document(scope, name, id);
      if (buffered !== undefined) return buffered.deleted ? undefined : buffered.value;
      const stored = reader.documentGet(owner, ws, name, id);
      pending.noteDocumentVersion(scope, name, id, stored?.version ?? 0);
      return stored?.data;
    },
    put(document) {
      requireWritable(context);
      const id = idOf(document);
      validate(document);
      pending.setDocument(scope, name, id, { deleted: false, value: document });
    },
    async patch(id, partial) {
      requireWritable(context);
      const current = await this.get(id);
      if (current === undefined) throw storeFailure(context, 'STORE_NOT_FOUND', { params: { collection: name, id } });
      const merged = objectOf(applyMergePatch(current, partial));
      if (merged === undefined || merged[declaration.idField] !== id) {
        throw storeFailure(context, 'VALIDATION_FAILED', { issues: [{ path: declaration.idField, message: 'a patch cannot change the id' }] });
      }
      validate(merged);
      pending.setDocument(scope, name, id, { deleted: false, value: merged });
      return merged;
    },
    delete(id) {
      requireWritable(context);
      pending.setDocument(scope, name, id, { deleted: true });
    },
    async find(query = {}) {
      const checked = checkedQuery(context, query);
      guardScan(checked);
      const buffered = pending.documents(scope, name);
      const fetchLimit = checked.limit === undefined ? storeLimits.resultRows + buffered.length + 1 : checked.limit + buffered.length;
      const stored = withSqlErrors(context, () => reader.documentFind(owner, ws, name, { where: checked.where, orderBy: checked.orderBy, limit: fetchLimit }));
      const bufferedIds = new Set(buffered.map((entry) => entry.id));
      const committed = stored.filter((row) => !bufferedIds.has(row.id));
      const added = buffered.flatMap((entry) => (!entry.pending.deleted && matchesDocument(entry.pending.value, checked.where) ? [{ id: entry.id, data: entry.pending.value }] : []));
      const ordered = [...committed, ...added].sort(compareDocuments(checked.orderBy));
      const result = checked.limit === undefined ? ordered : ordered.slice(0, checked.limit);
      if (result.length > storeLimits.resultRows || jsonByteLength(result.map((row) => row.data)) > storeLimits.resultBytes) throw tooLarge(context, `the find on ${name}`);
      for (const row of committed) pending.noteDocumentVersion(scope, name, row.id, row.version);
      return result.map((row) => row.data);
    },
    async count(query = {}) {
      const checked = checkedQuery(context, { where: query.where ?? {} });
      guardScan(checked);
      const buffered = pending.documents(scope, name);
      const committed = withSqlErrors(context, () => reader.documentCount(owner, ws, name, checked.where));
      const replaced = withSqlErrors(context, () => reader.matchingIds(owner, ws, name, checked.where, buffered.map((entry) => entry.id)));
      const added = buffered.filter((entry) => !entry.pending.deleted && matchesDocument(entry.pending.value, checked.where));
      return committed - replaced.length + added.length;
    },
  };
}
