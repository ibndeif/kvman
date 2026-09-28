import { jsonObjectSchema, toJsonSchemaDocument, type Issue, type Json, type JsonObject, type SchemaView } from '@kvman/protocol';
import type { CommandDef, Ctx, MigrationDef, ProviderDef, QueryDef, SubscriptionDef } from '@kvman/sdk';

export type RegisteredFunction =
  | CommandDef['handle'] | QueryDef['handle'] | SubscriptionDef['handle'] | MigrationDef['up']
  | ProviderDef['complete'] | ProviderDef['status'] | NonNullable<ProviderDef['listModels']> | NonNullable<ProviderDef['countTokens']>;

// A command, query, or subscription definition as a host calls it: the host first parses the input with the same
// definition's schema, so the value has the type its handler declares.
export interface HandlerDefinition {
  handle(input: unknown, ctx: Ctx): Promise<unknown>;
}

export type Schema = CommandDef['input'];

// The Zod schemas a host checks with (05 §5.12): handler inputs and outputs by function reference, own event
// payloads by type, collection documents by name.
export type RecordedSchemas = {
  handlers: Map<string, { input: Schema; output: Schema | undefined }>;
  events: Map<string, Schema>;
  collections: Map<string, Schema>;
};

export type OnceOnlyCall = 'requestIsolation' | 'registerConfig' | 'registerDataVersion' | 'registerSettingsSection';

export type DataVersion = { version: number; compatibleWith: number[] };

const losslessHint = 'keep schemas to what JSON Schema expresses; convert values in the handler instead';

function isFunction(value: unknown): boolean {
  return typeof value === 'function';
}

export function compact(fields: Record<string, Json | undefined>): JsonObject {
  const entries = Object.entries(fields).filter((entry): entry is [string, Json] => entry[1] !== undefined);
  return Object.fromEntries(entries);
}

// A typed reference is the registered name itself with a type-only brand (ADR 0044).
export function reference<Ref extends string>(name: string): Ref {
  return name as Ref;
}

// What one run of setup registered: the manifest entries in call order, the mistakes only a run can show, and the
// functions keyed by their references.
export class Recording {
  readonly capabilities: JsonObject[] = [];
  isolation: JsonObject | null = null;
  readonly requireTypes: JsonObject[] = [];
  readonly requireComponents: JsonObject[] = [];
  readonly types: JsonObject[] = [];
  readonly subscriptions: JsonObject[] = [];
  readonly schedules: JsonObject[] = [];
  dataVersion: DataVersion | undefined;
  readonly migrations: JsonObject[] = [];
  readonly collections: JsonObject[] = [];
  readonly logs: JsonObject[] = [];
  readonly entities: JsonObject[] = [];
  config: JsonObject | null = null;
  readonly errors: JsonObject[] = [];
  readonly providers: JsonObject[] = [];
  readonly models: JsonObject[] = [];
  readonly pages: JsonObject[] = [];
  readonly navGroups: JsonObject[] = [];
  readonly navItems: JsonObject[] = [];
  readonly toolbarItems: JsonObject[] = [];
  readonly statusItems: JsonObject[] = [];
  readonly panels: JsonObject[] = [];
  readonly slots: JsonObject[] = [];
  readonly actions: JsonObject[] = [];
  readonly rendererTargets: JsonObject[] = [];
  readonly renderers: JsonObject[] = [];
  readonly components: JsonObject[] = [];
  settingsSection: JsonObject | null = null;

  readonly issues: Issue[] = [];
  readonly functions = new Map<string, RegisteredFunction>();
  readonly providerDefinitions = new Map<string, ProviderDef>();
  readonly schemas: RecordedSchemas = { handlers: new Map(), events: new Map(), collections: new Map() };
  readonly handlers = new Map<string, HandlerDefinition>();
  readonly migrationSteps = new Map<number, MigrationDef['up']>();
  private readonly onceOnlyCalls = new Set<OnceOnlyCall>();

  // An input is recorded in its input view (ADR 0077) but must convert in its output view too, which is where a
  // transform fails: the kernel could not enforce it (05 §5.12).
  jsonSchema(path: string, schema: Schema, view: SchemaView = 'output'): JsonObject | undefined {
    const output = toJsonSchemaDocument(schema, 'output');
    const conversion = view === 'output' || !output.ok ? output : toJsonSchemaDocument(schema, view);
    if (conversion.ok) return conversion.document;
    this.issues.push({ path, message: `the schema cannot be written as JSON Schema: ${conversion.message}`, hint: losslessHint });
    return undefined;
  }

  // A UI definition is JSON (05 §5.3), but extension code is untyped at runtime: the entry, without its undefined
  // fields, must parse as JSON, or the recording reports it at the entry's path.
  jsonEntry(path: string, fields: Record<string, unknown>): JsonObject | undefined {
    const parsed = jsonObjectSchema.safeParse(Object.fromEntries(Object.entries(fields).filter((entry) => entry[1] !== undefined)));
    if (parsed.success) return parsed.data;
    const [first] = parsed.error.issues;
    const at = first === undefined || first.path.length === 0 ? path : `${path}.${first.path.join('.')}`;
    this.issues.push({ path: at, message: 'the definition holds a value that is not JSON', hint: 'use only JSON values in UI definitions: no functions, dates, or class instances' });
    return undefined;
  }

  // Extension code is untyped at runtime: a registered handler may not be a function at all.
  bind(reference: string, path: string, handle: RegisteredFunction): void {
    if (!isFunction(handle)) {
      this.issues.push({ path, message: 'expected a function', hint: 'pass an async function as handle' });
      return;
    }
    if (!this.functions.has(reference)) this.functions.set(reference, handle);
  }

  bindMigration(to: number, up: MigrationDef['up']): void {
    if (isFunction(up) && !this.migrationSteps.has(to)) this.migrationSteps.set(to, up);
  }

  bindHandler(reference: string, definition: HandlerDefinition): void {
    if (isFunction(definition.handle) && !this.handlers.has(reference)) this.handlers.set(reference, definition);
  }

  firstCall(call: OnceOnlyCall, path: string): boolean {
    if (!this.onceOnlyCalls.has(call)) {
      this.onceOnlyCalls.add(call);
      return true;
    }
    this.issues.push({ path, message: `${call} is already called; it is called at most once`, hint: `call ${call} once` });
    return false;
  }
}
