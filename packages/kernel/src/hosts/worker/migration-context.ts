import {
  jsonObjectSchema, jsonSchema, migrationDocRowSchema, migrationKvRowSchema, migrationLogRowSchema, migrationRowsSchema,
  type Issue, type Json, type JsonObject, type MigrationConfigWrite, type MigrationCursor, type MigrationWrite, type RpcCall,
} from '@kvman/protocol';
import type {
  ConfigScope, MigrationContext, MigrationData, MigrationDocument, MigrationKvEntry, MigrationLogEntry, MigrationRemoval, MigrationVisit,
} from '@kvman/sdk';
import type { ExtensionRecording } from '../../extension/record-extension.ts';
import { kernelProblem, ProblemError } from '../../problems.ts';
import type { RpcClient } from './rpc-client.ts';

// What one step collects: its writes, and its config writes keyed by scope and workspace (the last one wins).
export type StepWrites = { writes: MigrationWrite[]; config: Map<string, MigrationConfigWrite> };

export type MigrationContextParts = { client: RpcClient; invocationId: string; correlationId: string; extension: ExtensionRecording; step: StepWrites };

type RowsRequest = Extract<RpcCall, { name: 'migration.rows' }>;

const removal: MigrationRemoval = Object.freeze({ removal: true });

function invalid(parts: MigrationContextParts, detail: string, issues?: Issue[]): ProblemError {
  return new ProblemError(kernelProblem('VALIDATION_FAILED', { correlationId: parts.correlationId, detail, ...(issues === undefined ? {} : { issues }) }));
}

async function call(parts: MigrationContextParts, request: RpcCall): Promise<Json | undefined> {
  const result = await parts.client.call(parts.invocationId, request);
  if (!result.ok) throw new ProblemError(result.problem);
  return result.value;
}

// ADR 0143: the kernel streams the rows in batches; the next batch starts after the cursor of the last one.
async function* rowsOf(parts: MigrationContextParts, request: Omit<RowsRequest, 'name' | 'after'>): AsyncGenerator<unknown> {
  let after: MigrationCursor | undefined;
  do {
    const batch = migrationRowsSchema.parse(await call(parts, { name: 'migration.rows', ...request, ...(after === undefined ? {} : { after }) }));
    yield* batch.rows;
    after = batch.next;
  } while (after !== undefined);
}

function jsonOf(parts: MigrationContextParts, value: unknown, what: string): Json {
  const parsed = jsonSchema.safeParse(value);
  if (!parsed.success) throw invalid(parts, `the replacement ${what} is not JSON`);
  return parsed.data;
}

function documentOf(parts: MigrationContextParts, collection: string, id: string, value: unknown): JsonObject {
  const schema = parts.extension.schemas.collections.get(collection);
  const checked = schema?.safeParse(value);
  if (checked !== undefined && !checked.success) {
    const issues = checked.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
    throw invalid(parts, `a replaced document of the collection "${collection}" does not match its schema`, issues);
  }
  const document = jsonObjectSchema.safeParse(value);
  if (!document.success) throw invalid(parts, `a replaced document of the collection "${collection}" is not a JSON object`);
  const idField = parts.extension.manifest.data.collections.find((entry) => entry.name === collection)?.idField ?? 'id';
  if (document.data[idField] !== id) throw invalid(parts, `a replaced document of the collection "${collection}" must keep its ${idField} "${id}"`);
  return document.data;
}

async function eachKv(parts: MigrationContextParts, visit: MigrationVisit<MigrationKvEntry, Json>): Promise<void> {
  for await (const raw of rowsOf(parts, { data: 'kv' })) {
    const row = migrationKvRowSchema.parse(raw);
    const result = await visit(row);
    if (result === removal) parts.step.writes.push({ kind: 'kv.delete', workspaceId: row.workspaceId, key: row.key });
    else if (result !== undefined) parts.step.writes.push({ kind: 'kv.set', workspaceId: row.workspaceId, key: row.key, value: jsonOf(parts, result, 'kv value') });
  }
}

async function eachDocument(parts: MigrationContextParts, collection: string, visit: (entry: { workspaceId: string | null; doc: JsonObject }) => unknown): Promise<void> {
  for await (const raw of rowsOf(parts, { data: 'docs', collection })) {
    const row = migrationDocRowSchema.parse(raw);
    const result = await visit({ workspaceId: row.workspaceId, doc: row.doc });
    if (result === removal) parts.step.writes.push({ kind: 'doc.delete', workspaceId: row.workspaceId, collection, id: row.id });
    else if (result !== undefined) parts.step.writes.push({ kind: 'doc.put', workspaceId: row.workspaceId, collection, id: row.id, data: documentOf(parts, collection, row.id, result) });
  }
}

type LogVisit = { workspaceId: string | null; key?: string; seq: number; value: Json };

async function eachLogEntry(parts: MigrationContextParts, log: string, visit: (entry: LogVisit) => unknown): Promise<void> {
  const family = log.endsWith(':*') ? log.slice(0, -1) : undefined;
  for await (const raw of rowsOf(parts, { data: 'logs', log })) {
    const row = migrationLogRowSchema.parse(raw);
    const key = family === undefined ? undefined : row.log.slice(family.length);
    const result = await visit({ workspaceId: row.workspaceId, ...(key === undefined ? {} : { key }), seq: row.seq, value: row.value });
    if (result === removal) parts.step.writes.push({ kind: 'log.delete', workspaceId: row.workspaceId, log: row.log, seq: row.seq });
    else if (result !== undefined) parts.step.writes.push({ kind: 'log.set', workspaceId: row.workspaceId, log: row.log, seq: row.seq, value: jsonOf(parts, result, 'log entry') });
  }
}

function configKey(scope: ConfigScope, workspaceId: string | undefined): string {
  return scope === 'global' ? 'global' : `workspace:${workspaceId ?? ''}`;
}

// Every stored document and log entry was checked against its registered schema when it was written, so a visited
// value has the type the registering extension declared for it; a replacement is checked again before it is kept.
function typedView<View>(untyped: unknown): View {
  return untyped as View;
}

// 04 §4.8, ADR 0143: the `m` a migration step receives.
export function createMigrationContext(parts: MigrationContextParts): MigrationContext {
  return {
    remove: removal,
    kv: { each: (visit: MigrationVisit<MigrationKvEntry, Json>) => eachKv(parts, visit) },
    collection<Doc extends object = JsonObject>(name: string) {
      return typedView<MigrationData<MigrationDocument<Doc>, Doc>>({ each: (visit: (entry: { workspaceId: string | null; doc: JsonObject }) => unknown) => eachDocument(parts, name, visit) });
    },
    log<Value = Json>(name: string) {
      return typedView<MigrationData<MigrationLogEntry<Value>, Value>>({ each: (visit: (entry: LogVisit) => unknown) => eachLogEntry(parts, name, visit) });
    },
    config: {
      get: async (scope: ConfigScope, workspaceId?: string): Promise<JsonObject | undefined> => {
        const pending = parts.step.config.get(configKey(scope, workspaceId));
        if (pending !== undefined) return pending.value;
        const value = await call(parts, { name: 'migration.config.get', scope, ...(workspaceId === undefined ? {} : { workspaceId }) });
        return value === undefined || value === null ? undefined : jsonObjectSchema.parse(value);
      },
      set: (scope: ConfigScope, value: JsonObject, workspaceId?: string): void => {
        const checked = jsonObjectSchema.safeParse(value);
        if (!checked.success) throw invalid(parts, 'a config value is a JSON object');
        parts.step.config.set(configKey(scope, workspaceId), { scope, ...(workspaceId === undefined ? {} : { workspaceId }), value: checked.data });
      },
    },
  };
}
