import type { BlobRefChange, Json, JsonObject, StoreScope, StoreWrite } from '@kvman/protocol';

export type PendingValue<Value> = { deleted: false; value: Value } | { deleted: true };

type LogPending = { appended: Array<{ seq: number; value: Json }>; truncatedBefore: number; dropped: boolean };

function entryKey(...parts: string[]): string {
  return parts.join('\u0000');
}

// Writes to one kv entry or document are coalesced into its final state, carrying the version first read, so a
// unit never checks one key twice; log operations keep their order.
export class PendingState {
  readonly #kv = new Map<string, { scope: StoreScope; key: string; pending: PendingValue<Json> }>();
  readonly #documents = new Map<string, { scope: StoreScope; collection: string; id: string; pending: PendingValue<JsonObject> }>();
  readonly #logs = new Map<string, LogPending>();
  readonly #logWrites: StoreWrite[] = [];
  readonly #versions = new Map<string, number>();
  // ctx.store.blobs.keep and release, in call order (04 §4.2).
  readonly blobRefs: BlobRefChange[] = [];

  noteKvVersion(scope: StoreScope, key: string, version: number): void {
    const name = entryKey('kv', scope, key);
    if (!this.#versions.has(name)) this.#versions.set(name, version);
  }

  noteDocumentVersion(scope: StoreScope, collection: string, id: string, version: number): void {
    const name = entryKey('doc', scope, collection, id);
    if (!this.#versions.has(name)) this.#versions.set(name, version);
  }

  kv(scope: StoreScope, key: string): PendingValue<Json> | undefined {
    return this.#kv.get(entryKey(scope, key))?.pending;
  }

  kvEntries(scope: StoreScope): Array<{ key: string; pending: PendingValue<Json> }> {
    return [...this.#kv.values()].filter((entry) => entry.scope === scope);
  }

  setKv(scope: StoreScope, key: string, pending: PendingValue<Json>): void {
    this.#kv.set(entryKey(scope, key), { scope, key, pending });
  }

  document(scope: StoreScope, collection: string, id: string): PendingValue<JsonObject> | undefined {
    return this.#documents.get(entryKey(scope, collection, id))?.pending;
  }

  documents(scope: StoreScope, collection: string): Array<{ id: string; pending: PendingValue<JsonObject> }> {
    return [...this.#documents.values()].filter((entry) => entry.scope === scope && entry.collection === collection);
  }

  setDocument(scope: StoreScope, collection: string, id: string, pending: PendingValue<JsonObject>): void {
    this.#documents.set(entryKey(scope, collection, id), { scope, collection, id, pending });
  }

  log(scope: StoreScope, log: string): LogPending {
    const name = entryKey(scope, log);
    const existing = this.#logs.get(name);
    if (existing !== undefined) return existing;
    const created: LogPending = { appended: [], truncatedBefore: 0, dropped: false };
    this.#logs.set(name, created);
    return created;
  }

  appendLog(scope: StoreScope, log: string, seq: number, value: Json): void {
    this.log(scope, log).appended.push({ seq, value });
    this.#logWrites.push({ kind: 'log.append', scope, log, seq, value });
  }

  truncateLog(scope: StoreScope, log: string, seq: number): void {
    const pending = this.log(scope, log);
    pending.truncatedBefore = Math.max(pending.truncatedBefore, seq);
    this.#logWrites.push({ kind: 'log.truncate-before', scope, log, seq });
  }

  dropLog(scope: StoreScope, log: string): void {
    const pending = this.log(scope, log);
    pending.dropped = true;
    pending.appended = [];
    this.#logWrites.push({ kind: 'log.drop', scope, log });
  }

  #expected(name: string): { expectedVersion?: number } {
    const version = this.#versions.get(name);
    return version === undefined ? {} : { expectedVersion: version };
  }

  writes(): StoreWrite[] {
    const kvWrites = [...this.#kv.values()].map(({ scope, key, pending }): StoreWrite => {
      const expected = this.#expected(entryKey('kv', scope, key));
      return pending.deleted ? { kind: 'kv.delete', scope, key, ...expected } : { kind: 'kv.set', scope, key, value: pending.value, ...expected };
    });
    const documentWrites = [...this.#documents.values()].map(({ scope, collection, id, pending }): StoreWrite => {
      const expected = this.#expected(entryKey('doc', scope, collection, id));
      return pending.deleted ? { kind: 'doc.delete', scope, collection, id, ...expected } : { kind: 'doc.put', scope, collection, id, data: pending.value, ...expected };
    });
    return [...kvWrites, ...documentWrites, ...this.#logWrites];
  }
}
