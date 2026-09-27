import type { Json, JsonObject } from '@kvman/protocol';
import type { ConfigScope } from './context.ts';
import type { CollectionRef, LogRef } from './references.ts';

/** The marker an `each` callback returns to delete the entry it was given. */
export interface MigrationRemoval {
  readonly removal: true;
}

/** What an `each` callback returns: a replacement, `undefined` to keep the entry, or `m.remove` to delete it. */
export type MigrationResult<Value> = Value | undefined | MigrationRemoval;

/** A visit callback, which may be async. */
export type MigrationVisit<Entry, Value> = (entry: Entry) => MigrationResult<Value> | Promise<MigrationResult<Value>>;

/** One kv entry visited by a migration; `workspaceId` is `null` for global data. */
export type MigrationKvEntry = { workspaceId: string | null; key: string; value: Json };

/** One document visited by a migration; `workspaceId` is `null` for global data. */
export type MigrationDocument<Doc> = { workspaceId: string | null; doc: Doc };

/** One log entry visited by a migration; `key` names the log of a family (`history:<key>`). */
export type MigrationLogEntry<Value> = { workspaceId: string | null; key?: string; seq: number; value: Value };

/** Every entry of one kind of the extension's data, in every workspace and global. */
export interface MigrationData<Entry, Value> {
  /** Visits the data as committed when the step started: global first, then workspaces by id, then in key, id, or seq order. */
  each(visit: MigrationVisit<Entry, Value>): Promise<void>;
}

/** What a data migration step acts through (04 §4.8). */
export interface MigrationContext {
  /** The marker an `each` callback returns to delete the entry. */
  readonly remove: MigrationRemoval;
  /** The extension's kv entries. */
  readonly kv: MigrationData<MigrationKvEntry, Json>;
  /** The documents of a collection this extension registered; a replacement must match its schema and keep its id. */
  collection<Doc extends object>(reference: CollectionRef<string, Doc>): MigrationData<MigrationDocument<Doc>, Doc>;
  /** The documents of a collection this extension registered. */
  collection<Doc extends object = JsonObject>(name: string): MigrationData<MigrationDocument<Doc>, Doc>;
  /** The entries of a log this extension registered, or of every log of a family (`history:*`). */
  log<Entry>(reference: LogRef<string, Entry>): MigrationData<MigrationLogEntry<Entry>, Entry>;
  /** The entries of a log this extension registered, or of every log of a family (`history:*`). */
  log<Value = Json>(name: string): MigrationData<MigrationLogEntry<Value>, Value>;
  /** The extension's stored config. */
  readonly config: {
    /** The stored value in `scope` (of `workspaceId` for `workspace`), with this step's own writes, or `undefined`. */
    get(scope: ConfigScope, workspaceId?: string): Promise<JsonObject | undefined>;
    /** Replaces the stored value when the step commits. */
    set(scope: ConfigScope, value: JsonObject, workspaceId?: string): void;
  };
}
