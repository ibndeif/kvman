import { toJsonSchemaDocument, type Issue, type Json, type JsonObject } from '@kvman/protocol';
import type { CommandDef, MigrationDef, QueryDef, SubscriptionDef } from '@kvman/sdk';

export type RegisteredFunction = CommandDef['handle'] | QueryDef['handle'] | SubscriptionDef['handle'] | MigrationDef['up'];

type Schema = CommandDef['input'];

export type OnceOnlyCall = 'requestIsolation' | 'registerConfig' | 'registerDataVersion';

export type TypeName = { name: string; kind: 'command' | 'query' | 'event' };

export type DataVersion = { version: number; compatibleWith: number[]; steps: number[] };

function isFunction(value: unknown): boolean {
  return typeof value === 'function';
}

export function compact(fields: Record<string, Json | undefined>): JsonObject {
  const entries = Object.entries(fields).filter((entry): entry is [string, Json] => entry[1] !== undefined);
  return Object.fromEntries(entries);
}

// What one run of setup registered: the manifest entries in call order, the names the registration rules check,
// and the functions keyed by their references.
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

  readonly typeNames: TypeName[] = [];
  readonly capabilityNames: string[] = [];
  readonly subscriptionEvents: string[] = [];
  readonly scheduleNames: string[] = [];
  readonly collectionNames: string[] = [];
  readonly logNames: string[] = [];
  readonly entityNames: string[] = [];
  readonly errorCodes: string[] = [];

  readonly issues: Issue[] = [];
  readonly functions = new Map<string, RegisteredFunction>();
  private readonly onceOnlyCalls = new Set<OnceOnlyCall>();

  jsonSchema(path: string, schema: Schema): JsonObject | undefined {
    const conversion = toJsonSchemaDocument(schema);
    if (conversion.ok) return conversion.document;
    this.issues.push({ path, message: `the schema cannot be written as JSON Schema: ${conversion.message}` });
    return undefined;
  }

  // Extension code is untyped at runtime: a registered handler may not be a function at all.
  bind(reference: string, path: string, handle: RegisteredFunction): void {
    if (!isFunction(handle)) {
      this.issues.push({ path, message: 'expected a function' });
      return;
    }
    if (!this.functions.has(reference)) this.functions.set(reference, handle);
  }

  firstCall(call: OnceOnlyCall, path: string): boolean {
    if (!this.onceOnlyCalls.has(call)) {
      this.onceOnlyCalls.add(call);
      return true;
    }
    this.issues.push({ path, message: `${call} is already called; it is called at most once` });
    return false;
  }
}
