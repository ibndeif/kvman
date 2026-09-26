import type { Filter, Json, StoreScope } from '@kvman/protocol';
import type { DocumentQuery, StoredDocument, StoredLogEntry, StoreReader, Versioned } from './store-reader.ts';

// Where a read happens: the owner and workspace for a host that reads the database itself, and the scope for one
// that asks the kernel, which sets the owner and workspace (ADR 0131).
export type ReadScope = { owner: string; ws: string; scope: StoreScope };

// A store's reads of committed rows (04 §4.1): a host's own read-only connection, or the kernel's read pool.
export interface StoreReads {
  kvGet(at: ReadScope, key: string): Promise<Versioned<Json> | undefined>;
  kvList(at: ReadScope, prefix: string, maxRows: number): Promise<Array<Versioned<Json> & { key: string }>>;
  documentGet(at: ReadScope, collection: string, id: string): Promise<StoredDocument | undefined>;
  documentFind(at: ReadScope, collection: string, query: DocumentQuery): Promise<StoredDocument[]>;
  documentCount(at: ReadScope, collection: string, where: Filter): Promise<number>;
  matchingIds(at: ReadScope, collection: string, where: Filter, ids: readonly string[]): Promise<string[]>;
  logLastSeq(at: ReadScope, log: string): Promise<number>;
  logRead(at: ReadScope, log: string, after: number, before: number, maxRows: number): Promise<StoredLogEntry[]>;
  logReadNewest(at: ReadScope, log: string, after: number, before: number, count: number): Promise<StoredLogEntry[]>;
}

// Reads through a connection the host holds (shared and dedicated hosts).
export class ConnectionReads implements StoreReads {
  readonly #reader: StoreReader;

  constructor(reader: StoreReader) {
    this.#reader = reader;
  }

  async kvGet(at: ReadScope, key: string): Promise<Versioned<Json> | undefined> {
    return this.#reader.kvGet(at.owner, at.ws, key);
  }

  async kvList(at: ReadScope, prefix: string, maxRows: number): Promise<Array<Versioned<Json> & { key: string }>> {
    return this.#reader.kvList(at.owner, at.ws, prefix, maxRows);
  }

  async documentGet(at: ReadScope, collection: string, id: string): Promise<StoredDocument | undefined> {
    return this.#reader.documentGet(at.owner, at.ws, collection, id);
  }

  async documentFind(at: ReadScope, collection: string, query: DocumentQuery): Promise<StoredDocument[]> {
    return this.#reader.documentFind(at.owner, at.ws, collection, query);
  }

  async documentCount(at: ReadScope, collection: string, where: Filter): Promise<number> {
    return this.#reader.documentCount(at.owner, at.ws, collection, where);
  }

  async matchingIds(at: ReadScope, collection: string, where: Filter, ids: readonly string[]): Promise<string[]> {
    return this.#reader.matchingIds(at.owner, at.ws, collection, where, ids);
  }

  async logLastSeq(at: ReadScope, log: string): Promise<number> {
    return this.#reader.logLastSeq(at.owner, at.ws, log);
  }

  async logRead(at: ReadScope, log: string, after: number, before: number, maxRows: number): Promise<StoredLogEntry[]> {
    return this.#reader.logRead(at.owner, at.ws, log, after, before, maxRows);
  }

  async logReadNewest(at: ReadScope, log: string, after: number, before: number, count: number): Promise<StoredLogEntry[]> {
    return this.#reader.logReadNewest(at.owner, at.ws, log, after, before, count);
  }
}
