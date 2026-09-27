import { flagOf } from './flag-names.ts';

// The kv shim uses only Node built-ins (ADR 0141), so it reads the JSON Schema it is given as plain data.
export type FieldSchema = { type?: unknown; items?: unknown; description?: unknown };
export type InputSchema = { properties?: Record<string, FieldSchema>; required?: unknown };

export type KvCall = { payload: unknown; wait?: number; idempotencyKey?: string };

export const maxWaitMs = 60_000;

// A mistake in the command line (exit 2), not a problem the kernel answered.
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

function typeOf(schema: FieldSchema | undefined): string | undefined {
  return typeof schema?.type === 'string' ? schema.type : undefined;
}

function isFieldSchema(value: unknown): value is FieldSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The input schema kv received from the help op, keeping only fields it can read.
export function inputSchemaOf(value: unknown): InputSchema {
  const properties: unknown = isFieldSchema(value) ? Object.getOwnPropertyDescriptor(value, 'properties')?.value : undefined;
  if (!isFieldSchema(properties)) return {};
  return { properties: Object.fromEntries(Object.entries(properties).flatMap(([name, schema]) => (isFieldSchema(schema) ? [[name, schema] as const] : []))) };
}

function parsedJson(flag: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError(`--${flag} takes JSON`);
  }
}

function coerce(flag: string, schema: FieldSchema | undefined, value: string): unknown {
  const type = typeOf(schema);
  if (type === 'integer' || type === 'number') {
    const number = Number(value);
    if (value.trim() === '' || !Number.isFinite(number) || (type === 'integer' && !Number.isInteger(number))) throw new UsageError(`--${flag} takes ${type === 'integer' ? 'an integer' : 'a number'}`);
    return number;
  }
  if (type === 'boolean') {
    if (value === 'true' || value === 'false') return value === 'true';
    throw new UsageError(`--${flag} takes true or false`);
  }
  if (type === 'object' || type === 'array') return parsedJson(flag, value);
  return value;
}

type Flags = { fields: Map<string, { field: string; schema: FieldSchema }>; payload: Record<string, unknown> };

function assign(flags: Flags, flag: string, value: string): void {
  const target = flags.fields.get(flag);
  if (target === undefined) throw new UsageError(`unknown flag --${flag}`);
  const { field, schema } = target;
  if (typeOf(schema) !== 'array') {
    flags.payload[field] = coerce(flag, schema, value);
    return;
  }
  const items = isFieldSchema(schema.items) ? schema.items : undefined;
  const list = flags.payload[field];
  flags.payload[field] = [...(Array.isArray(list) ? list : []), coerce(flag, items, value)];
}

// A boolean field is `--flag` (true) or `--no-flag` (false) and takes no value.
function booleanFlag(flags: Flags, flag: string): { field: string; value: boolean } | undefined {
  const direct = flags.fields.get(flag);
  if (direct !== undefined && typeOf(direct.schema) === 'boolean') return { field: direct.field, value: true };
  const negated = flag.startsWith('no-') ? flags.fields.get(flag.slice('no-'.length)) : undefined;
  if (negated !== undefined && typeOf(negated.schema) === 'boolean') return { field: negated.field, value: false };
  return undefined;
}

function waitOf(value: string): number {
  const wait = Number(value);
  if (!Number.isInteger(wait) || wait < 0 || wait > maxWaitMs) throw new UsageError(`--wait takes milliseconds from 0 to ${maxWaitMs}`);
  return wait;
}

// ADR 0141: flags map to the input's top-level fields and are coerced by their JSON Schema type; `--json -` and
// `--<field>-file -` read stdin; `--wait` and `--idempotency-key` are kv's own.
export function parseArguments(argv: readonly string[], input: InputSchema, readStdin: () => string): KvCall {
  const properties = input.properties ?? {};
  const flags: Flags = { fields: new Map(Object.entries(properties).map(([field, schema]) => [flagOf(field), { field, schema }])), payload: {} };
  let whole: unknown;
  const call: Omit<KvCall, 'payload'> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    if (!argument.startsWith('--')) throw new UsageError(`expected a flag, found "${argument}"`);
    const flag = argument.slice(2);
    const toggle = booleanFlag(flags, flag);
    if (toggle !== undefined) {
      flags.payload[toggle.field] = toggle.value;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined) throw new UsageError(`--${flag} needs a value`);
    index += 1;
    if (flag === 'json') whole = parsedJson(flag, value === '-' ? readStdin() : value);
    else if (flag === 'wait') call.wait = waitOf(value);
    else if (flag === 'idempotency-key') call.idempotencyKey = value;
    else if (flag.endsWith('-file') && value === '-') assign(flags, flag.slice(0, -'-file'.length), readStdin());
    else assign(flags, flag, value);
  }
  return { ...call, payload: whole ?? flags.payload };
}
