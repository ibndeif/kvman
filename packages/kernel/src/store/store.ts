import type { Collection, JsonObject, Kv, Store, StoreScope, Transaction, TransactionCollection, TransactionKv, TransactionScope, z } from '@kvman/sdk';
import type { IdGenerator } from '../ids.ts';
import { kernelProblem } from '../problems.ts';
import type { Connection } from '../storage/database.ts';
import { collectionOf } from './collections.ts';
import { kvOf, type ScopeKey, type WriteGuard } from './kv.ts';

// An extension's store (plan 02 §2.5): Promise-based calls that each commit alone, and `transaction`, whose `tx` has the
// same shape with synchronous calls inside one SQLite transaction.

export type StoreOwner = { extension: string; workspaceId: string };

const anyWrite: WriteGuard = () => undefined;

export const globalScope = '';

function asyncKv(kv: TransactionKv): Kv {
  return {
    get: async (key) => kv.get(key),
    set: async (key, value) => kv.set(key, value),
    delete: async (key) => kv.delete(key),
  };
}

function asyncCollection<Document extends JsonObject>(collection: TransactionCollection<Document>): Collection<Document> {
  return {
    insert: async (document) => collection.insert(document),
    get: async (id) => collection.get(id),
    find: async (filter, options) => collection.find(filter, options),
    count: async (filter) => collection.count(filter),
    update: async (id, patch) => collection.update(id, patch),
    delete: async (id) => collection.delete(id),
  };
}

function syncScope(connection: Connection, key: ScopeKey, ids: IdGenerator, beforeWrite: WriteGuard): TransactionScope {
  return {
    kv: kvOf(connection, key, beforeWrite),
    collection: <Document extends JsonObject>(name: string, schema: z.ZodType<Document>) => collectionOf(connection, key, name, schema, ids, beforeWrite),
  };
}

function asyncScope(scope: TransactionScope): StoreScope {
  return {
    kv: asyncKv(scope.kv),
    collection: <Document extends JsonObject>(name: string, schema: z.ZodType<Document>) => asyncCollection(scope.collection(name, schema)),
  };
}

function isThenable(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

function runTransaction<Result>(connection: Connection, owner: StoreOwner, ids: IdGenerator, beforeWrite: WriteGuard, fn: (tx: Transaction) => Result): Result {
  const tx: Transaction = {
    ...syncScope(connection, { extension: owner.extension, scope: owner.workspaceId }, ids, beforeWrite),
    global: syncScope(connection, { extension: owner.extension, scope: globalScope }, ids, beforeWrite),
  };
  // IMMEDIATE takes the write lock at the start, waiting out the busy timeout: a deferred transaction that read first
  // fails at once with "database is locked" when it writes after another connection committed (WAL's stale snapshot).
  return connection.transaction(() => {
    const result = fn(tx);
    if (isThenable(result)) {
      throw kernelProblem('VALIDATION_FAILED', 'A transaction callback must be synchronous; it returned a Promise, so nothing was stored.');
    }
    return result;
  }).immediate();
}

export function createStore(connection: Connection, owner: StoreOwner, ids: IdGenerator, beforeWrite: WriteGuard = anyWrite): Store {
  const workspace = syncScope(connection, { extension: owner.extension, scope: owner.workspaceId }, ids, beforeWrite);
  const global = syncScope(connection, { extension: owner.extension, scope: globalScope }, ids, beforeWrite);
  return {
    ...asyncScope(workspace),
    global: asyncScope(global),
    transaction: async (fn) => runTransaction(connection, owner, ids, beforeWrite, fn),
  };
}
