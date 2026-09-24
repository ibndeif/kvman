import type { Issue, JsonObject, Message, StoreWrite } from '@kvman/protocol';
import {
  createCollectionIndexes, createHandlerStore, openReadConnection, betterSqlite3Driver, StoreReader, UnindexedScanWarnings,
  type CommitResult, type DataDeclarations, type HandlerStore, type UnindexedScan,
} from '../../src/index.ts';
import { invocationMessage, now, openTestStore, ulids, workspaceId, type TestStore } from '../storage/harness.ts';

export const owner = '@acme/pdf';

export const declarations: DataDeclarations = {
  collections: [
    { name: 'files', idField: 'id', indexes: [['status', 'createdAt']] },
    { name: 'records', idField: 'fileId', indexes: [] },
  ],
  logs: ['history:*', 'audit'],
};

export function rejectInvalidField(_collection: string, document: JsonObject): Issue[] {
  return 'invalid' in document ? [{ path: 'invalid', message: 'not allowed by the schema' }] : [];
}

export type StoreFixture = TestStore & { reader: StoreReader; warnings: UnindexedScan[]; scans: UnindexedScanWarnings };

export function openStoreFixture(): StoreFixture {
  const store = openTestStore({ 'pdf.translate': owner });
  for (const collection of declarations.collections) createCollectionIndexes(store.connection, owner, collection);
  const warnings: UnindexedScan[] = [];
  return { ...store, reader: new StoreReader(openReadConnection(store.file, betterSqlite3Driver)), warnings, scans: new UnindexedScanWarnings(now, (scan) => warnings.push(scan)) };
}

export type HandlerOptions = { workspace?: string | null; readOnly?: boolean };

export function handlerStore(fixture: StoreFixture, options: HandlerOptions = {}): HandlerStore {
  return createHandlerStore({
    reader: fixture.reader, owner, workspaceId: options.workspace === null ? undefined : (options.workspace ?? workspaceId),
    data: declarations, validateDocument: rejectInvalidField, correlationId: ulids.next(), readOnly: options.readOnly ?? false,
    unindexedScans: fixture.scans,
  });
}

export async function commitWrites(fixture: StoreFixture, writes: StoreWrite[], invocation?: Message): Promise<CommitResult> {
  const message = invocation ?? (await invocationMessage(fixture));
  return fixture.pipeline.enqueue({
    origin: { kind: 'invocation', invocation: { message, extension: owner, outcome: { ok: true, value: null } } },
    writes,
    sends: [],
    publishes: [],
  });
}

export async function commit(fixture: StoreFixture, handler: HandlerStore): Promise<CommitResult> {
  return commitWrites(fixture, handler.writes());
}

export async function seedDocuments(fixture: StoreFixture, collection: string, documents: JsonObject[]): Promise<void> {
  const handler = handlerStore(fixture);
  for (const document of documents) handler.store.collection(collection).put(document);
  const result = await commit(fixture, handler);
  if (!result.committed) throw new Error(`seeding failed: ${result.problem.code}`);
}
