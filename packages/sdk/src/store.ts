import type { z } from 'zod';
import type { Json, JsonObject, JsonPrimitive } from './json.ts';

/** A stored document: its fields plus the kernel-assigned `id`. */
export type Stored<Document> = Document & { id: string };

/** Equality on top-level fields; every field given must match. */
export type Filter<Document> = { [Field in keyof Document]?: Extract<Document[Field], JsonPrimitive> };

/** How `find` pages: a required `limit` (at most 1000), and `order` by id (`asc`, oldest first, by default). */
export type FindOptions = { limit: number; order?: 'asc' | 'desc' };

/** A key-value map of JSON values. */
export type Kv = {
  /** The value, or `undefined` when the key holds none. */
  get(key: string): Promise<Json | undefined>;
  /** Stores a value (at most 16 MiB of JSON). */
  set(key: string, value: Json): Promise<void>;
  /** Removes a key. */
  delete(key: string): Promise<void>;
};

/** A collection of JSON documents, checked against its schema on write and parsed on read. */
export type Collection<Document extends JsonObject> = {
  /** Adds a document and returns it with its id. */
  insert(document: Document): Promise<Stored<Document>>;
  /** The document, or `undefined` when there is none with that id. */
  get(id: string): Promise<Stored<Document> | undefined>;
  /** The matching documents by id. */
  find(filter: Filter<Document>, options: FindOptions): Promise<Stored<Document>[]>;
  /** The number of matching documents. */
  count(filter: Filter<Document>): Promise<number>;
  /** Replaces the top-level fields in `patch` and returns the document; a missing id fails `NOT_FOUND`. */
  update(id: string, patch: Partial<Document>): Promise<Stored<Document>>;
  /** Removes a document; a missing id fails `NOT_FOUND`. */
  delete(id: string): Promise<void>;
};

/** A key-value map inside a transaction: synchronous calls. */
export type TransactionKv = {
  /** The value, or `undefined` when the key holds none. */
  get(key: string): Json | undefined;
  /** Stores a value. */
  set(key: string, value: Json): void;
  /** Removes a key. */
  delete(key: string): void;
};

/** A collection inside a transaction: synchronous calls. */
export type TransactionCollection<Document extends JsonObject> = {
  /** Adds a document and returns it with its id. */
  insert(document: Document): Stored<Document>;
  /** The document, or `undefined` when there is none with that id. */
  get(id: string): Stored<Document> | undefined;
  /** The matching documents by id. */
  find(filter: Filter<Document>, options: FindOptions): Stored<Document>[];
  /** The number of matching documents. */
  count(filter: Filter<Document>): number;
  /** Replaces the top-level fields in `patch` and returns the document. */
  update(id: string, patch: Partial<Document>): Stored<Document>;
  /** Removes a document. */
  delete(id: string): void;
};

/** One scope (a workspace, or global) inside a transaction. */
export type TransactionScope = {
  /** The scope's key-value map. */
  kv: TransactionKv;
  /** A collection of this extension in the scope. */
  collection<Document extends JsonObject>(name: string, schema: z.ZodType<Document>): TransactionCollection<Document>;
};

/** A transaction: the workspace scope, plus `global`. */
export type Transaction = TransactionScope & {
  /** The home-wide scope. */
  global: TransactionScope;
};

/** One store scope: a workspace, or global. */
export type StoreScope = {
  /** The scope's key-value map. */
  kv: Kv;
  /** A collection of this extension in the scope. */
  collection<Document extends JsonObject>(name: string, schema: z.ZodType<Document>): Collection<Document>;
};

/** The calling extension's store: the current job's workspace, plus `global`. */
export type Store = StoreScope & {
  /** The home-wide scope. */
  global: StoreScope;
  /** Runs `fn` in one SQLite transaction; a `fn` that returns a Promise is rolled back with `VALIDATION_FAILED`. */
  transaction<Result>(fn: (tx: Transaction) => Result): Promise<Result>;
};
