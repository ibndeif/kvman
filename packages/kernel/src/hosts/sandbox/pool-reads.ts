import {
  documentIdsSchema, kvRowSchema, readCountSchema, storedDocumentSchema, storedLogEntrySchema, versionedValueSchema, type Filter, type Json, type StoreRead,
} from '@kvman/protocol';
import { ProblemError } from '../../problems.ts';
import type { DocumentQuery, StoredDocument, StoredLogEntry, Versioned } from '../../store/store-reader.ts';
import type { ReadScope, StoreReads } from '../../store/store-reads.ts';
import type { RpcClient } from '../worker/rpc-client.ts';

// A sandboxed host's reads (ADR 0131): each is a `store.read` call that the kernel's read pool serves. Only the scope
// travels; the kernel sets the owner and workspace itself.
export class PoolReads implements StoreReads {
  readonly #client: RpcClient;
  readonly #invocationId: string;

  constructor(client: RpcClient, invocationId: string) {
    this.#client = client;
    this.#invocationId = invocationId;
  }

  async kvGet(at: ReadScope, key: string): Promise<Versioned<Json> | undefined> {
    const value = await this.#read({ op: 'kv.get', scope: at.scope, key });
    return value === null ? undefined : versionedValueSchema.parse(value);
  }

  async kvList(at: ReadScope, prefix: string, maxRows: number): Promise<Array<Versioned<Json> & { key: string }>> {
    return kvRowSchema.array().parse(await this.#read({ op: 'kv.list', scope: at.scope, prefix, maxRows }));
  }

  async documentGet(at: ReadScope, collection: string, id: string): Promise<StoredDocument | undefined> {
    const value = await this.#read({ op: 'doc.get', scope: at.scope, collection, id });
    return value === null ? undefined : storedDocumentSchema.parse(value);
  }

  async documentFind(at: ReadScope, collection: string, query: DocumentQuery): Promise<StoredDocument[]> {
    const read: StoreRead = {
      op: 'doc.find', scope: at.scope, collection, where: query.where, orderBy: query.orderBy.map(([field, direction]) => [field, direction]),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    };
    return storedDocumentSchema.array().parse(await this.#read(read));
  }

  async documentCount(at: ReadScope, collection: string, where: Filter): Promise<number> {
    return readCountSchema.parse(await this.#read({ op: 'doc.count', scope: at.scope, collection, where }));
  }

  async matchingIds(at: ReadScope, collection: string, where: Filter, ids: readonly string[]): Promise<string[]> {
    return documentIdsSchema.parse(await this.#read({ op: 'doc.matching-ids', scope: at.scope, collection, where, ids: [...ids] }));
  }

  async logLastSeq(at: ReadScope, log: string): Promise<number> {
    return readCountSchema.parse(await this.#read({ op: 'log.last-seq', scope: at.scope, log }));
  }

  async logRead(at: ReadScope, log: string, after: number, before: number, maxRows: number): Promise<StoredLogEntry[]> {
    return storedLogEntrySchema.array().parse(await this.#read({ op: 'log.read', scope: at.scope, log, after, before, maxRows }));
  }

  async logReadNewest(at: ReadScope, log: string, after: number, before: number, count: number): Promise<StoredLogEntry[]> {
    return storedLogEntrySchema.array().parse(await this.#read({ op: 'log.read-newest', scope: at.scope, log, after, before, count }));
  }

  async #read(read: StoreRead): Promise<Json> {
    const result = await this.#client.call(this.#invocationId, { name: 'store.read', read });
    if (!result.ok) throw new ProblemError(result.problem);
    return result.value ?? null;
  }
}
