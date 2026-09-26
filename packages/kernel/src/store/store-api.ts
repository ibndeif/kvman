import type { BlobRefChange, Json, JsonObject, StoreScope, StoreWrite } from '@kvman/protocol';
import type { Collection, Log, ScopedStore, Store } from '@kvman/sdk';
import { createBlobStore } from './blob-api.ts';
import { createCollection } from './collection-api.ts';
import { createKvStore } from './kv-api.ts';
import { createLog } from './log-api.ts';
import { PendingState } from './pending-state.ts';
import { storeFailure, type ScopeBinding, type StoreContext } from './store-context.ts';

export type StoreOptions = Omit<StoreContext, 'pending'>;

export type HandlerStore = { store: Store; writes(): StoreWrite[]; blobRefs(): BlobRefChange[] };

function logMatches(families: readonly string[], name: string): boolean {
  return families.some((family) => (family.endsWith(':*') ? name.startsWith(family.slice(0, -1)) && name.length > family.length - 1 : name === family));
}

// With a family's reference, log(history, key) is the log history:<key> (ADR 0044).
function familyMember(context: StoreContext, family: string, key: string): string {
  if (!family.endsWith(':*')) {
    throw storeFailure(context, 'VALIDATION_FAILED', { detail: `"${family}" is not a log family`, hint: 'only a log family such as "history:*" takes a key' });
  }
  return `${family.slice(0, -1)}${key}`;
}

// Every document and log entry was checked against the collection's or log's registered schema when it was written,
// so a stored value has the type the registering extension declared for it.
function typedView<View>(untyped: unknown): View {
  return untyped as View;
}

function scopedStore(binding: ScopeBinding): ScopedStore {
  const { context } = binding;
  const kv = createKvStore(binding);
  const blobs = createBlobStore(binding);
  return {
    kv,
    blobs,
    collection<Doc extends object = JsonObject>(name: string) {
      const declaration = context.data.collections.find((collection) => collection.name === name);
      if (declaration === undefined) {
        const registered = context.data.collections.map((collection) => collection.name).join(', ') || 'none';
        throw storeFailure(context, 'VALIDATION_FAILED', { detail: `no collection "${name}" is registered`, hint: `registered collections: ${registered}` });
      }
      return typedView<Collection<Doc>>(createCollection(binding, declaration));
    },
    log<Value = Json>(name: string, key?: string) {
      const logName = key === undefined ? name : familyMember(context, name, key);
      if (!logMatches(context.data.logs, logName)) {
        throw storeFailure(context, 'VALIDATION_FAILED', { detail: `"${logName}" matches no registered log`, hint: `registered logs: ${context.data.logs.join(', ') || 'none'}` });
      }
      return typedView<Log<Value>>(createLog(binding, logName));
    },
  };
}

function workspaceStore(context: StoreContext): ScopedStore {
  const scope: StoreScope = 'workspace';
  if (context.workspaceId !== undefined) return scopedStore({ context, scope, ws: context.workspaceId });
  const refuse = (): never => {
    throw storeFailure(context, 'WORKSPACE_INVALID', { detail: 'this handler has no workspace', hint: 'use ctx.store.global' });
  };
  return {
    get kv() {
      return refuse();
    },
    get blobs() {
      return refuse();
    },
    collection: refuse,
    log: refuse,
  };
}

export function createHandlerStore(options: StoreOptions): HandlerStore {
  const context: StoreContext = { ...options, pending: new PendingState() };
  const global = scopedStore({ context, scope: 'global', ws: '' });
  const workspace = workspaceStore(context);
  const store: Store = {
    get kv() {
      return workspace.kv;
    },
    get blobs() {
      return workspace.blobs;
    },
    collection: <Doc extends object = JsonObject>(name: string) => workspace.collection<Doc>(name),
    log: <Value = Json>(name: string, key?: string) => workspace.log<Value>(name, key),
    global,
  };
  return { store, writes: () => context.pending.writes(), blobRefs: () => [...context.pending.blobRefs] };
}
