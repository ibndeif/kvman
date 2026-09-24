import type { Filter, Json, JsonObject } from '@kvman/protocol';
import type { CollectionRef, LogRef } from './references.ts';

/** One kv entry returned by `kv.list`. */
export type KvEntry<Value extends Json = Json> = { key: string; value: Value };

/** Small JSON values by key, scoped to the extension and the invocation's workspace (or global). */
export interface KvStore {
  /** The value at `key`, or `undefined`; sees this handler's pending writes. */
  get<Value extends Json = Json>(key: string): Promise<Value | undefined>;
  /** Sets `key` when the handler commits (values up to 1 MB). */
  set(key: string, value: Json): void;
  /** Deletes `key` when the handler commits. */
  delete(key: string): void;
  /** Every entry whose key starts with `prefix`, ordered by key. */
  list<Value extends Json = Json>(prefix: string): Promise<Array<KvEntry<Value>>>;
}

/** Ordering of a find: a field path and a direction. */
export type OrderBy = Array<[field: string, direction: 'asc' | 'desc']>;

/** What `find` returns: matching documents, ordered, up to `limit`. */
export type FindQuery = { where?: Filter; orderBy?: OrderBy; limit?: number };

/** Typed documents with declared indexes, read with the filter language. */
export interface Collection<Doc extends object = JsonObject> {
  /** The document with this id, or `undefined`. */
  get(id: string): Promise<Doc | undefined>;
  /** Inserts or replaces the document when the handler commits. */
  put(doc: Doc): void;
  /** Applies a JSON Merge Patch to the document now and returns the result; the write happens at commit. */
  patch(id: string, partial: JsonObject): Promise<Doc>;
  /** Deletes the document when the handler commits; no error if it is missing. */
  delete(id: string): void;
  /** Every matching document, after `orderBy`, up to `limit`. */
  find(query?: FindQuery): Promise<Doc[]>;
  /** How many documents match. */
  count(query?: { where?: Filter }): Promise<number>;
}

/** One log entry with its sequence number. */
export type LogEntry<Value = Json> = { seq: number; value: Value };

/** A range of a log: entries after or before a seq, and at most the last `last` of them. */
export type LogRange = { after?: number; before?: number; last?: number };

/** An append-only sequence numbered 1, 2, 3, … */
export interface Log<Value = Json> {
  /** Appends when the handler commits and returns the entry's seq now. */
  append(value: Value): Promise<number>;
  /** The entries in the range, oldest first. */
  read(range?: LogRange): Promise<Array<LogEntry<Value>>>;
  /** The newest entry, or `undefined`. */
  last(): Promise<LogEntry<Value> | undefined>;
  /** Removes the entries before `seq` when the handler commits. */
  truncateBefore(seq: number): void;
  /** Removes the whole log when the handler commits. */
  drop(): void;
}

/** The three data primitives in one scope. */
export interface ScopedStore {
  /** Key-value entries. */
  readonly kv: KvStore;
  /** A collection this extension registered, typed by its reference. */
  collection<Doc extends object>(reference: CollectionRef<string, Doc>): Collection<Doc>;
  /** A collection this extension registered. */
  collection<Doc extends object = JsonObject>(name: string): Collection<Doc>;
  /** The log `<family>:<key>` of a log family this extension registered, typed by its reference. */
  log<Entry>(family: LogRef<`${string}:*`, Entry>, key: string): Log<Entry>;
  /** A log this extension registered, typed by its reference. */
  log<Entry>(reference: LogRef<string, Entry>): Log<Entry>;
  /** A log whose name matches a log this extension registered; with `key`, the log `<family>:<key>` of a family. */
  log<Value = Json>(name: string, key?: string): Log<Value>;
}

/** The extension's storage in the invocation's workspace, with `global` for global scope. */
export interface Store extends ScopedStore {
  /** The same primitives in global scope. */
  readonly global: ScopedStore;
}
