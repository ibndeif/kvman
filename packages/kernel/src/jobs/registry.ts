import { z, type CommandRegistration, type QueryRegistration, type SettingRegistration } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import type { SettingDefinition } from '../settings/settings.ts';
import type { JobKind } from './current-job.ts';
import type { HandlerEntry } from './handlers.ts';

// What the extensions registered in one worker, checked as they register (plan 02 §2.9, §2.13, 03 §3.1).

const mebibyte = 1024 * 1024;
const defaultBytes = mebibyte;
const maximumBytes = 32 * mebibyte;
const defaultTimeoutMs = 600_000;
const defaultRetries = 3;
const namePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)+$/;
// A setting key's segments are lower camelCase, such as `kvai.defaultModel` (ADR 0009, 64).
const settingKeyPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-zA-Z0-9]*)+$/;

export type Registration = {
  kind: JobKind;
  name: string;
  owner: string;
  description: string;
  input: z.ZodType;
  output: z.ZodType;
  start: (input: unknown) => StartedJob;
  public: boolean;
  timeoutMs: number;
  retries: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  // Runs only as a sync call: queueing or scheduling it fails VALIDATION_FAILED (`kernel.secrets.set`, plan 02 §2.8).
  syncOnly: boolean;
};

export type Owner = { name: string; namespace: string };

// The input parsed by the registration's own schema, ready to hand to its handler; or why it doesn't fit.
export type StartedJob = { error: z.ZodError } | { run: () => unknown };

const optionsSchema = z.object({
  description: z.string().trim().min(1),
  input: z.instanceof(z.ZodType),
  output: z.instanceof(z.ZodType),
  handle: z.custom<(input: unknown) => unknown>((value) => typeof value === 'function', 'handle must be a function'),
  public: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
  retries: z.number().int().nonnegative().optional(),
  maxInputBytes: z.number().int().positive().max(maximumBytes).optional(),
  maxOutputBytes: z.number().int().positive().max(maximumBytes).optional(),
});

const settingSchema = z.object({
  description: z.string().trim().min(1),
  schema: z.instanceof(z.ZodType),
  scopes: z.union([z.tuple([z.literal('global'), z.literal('workspace')]), z.tuple([z.literal('global')]), z.tuple([])]).optional(),
});

function invalid(owner: Owner, message: string, name: string): Error {
  return kernelProblem('EXTENSION_INVALID', `${owner.name}: ${message}`, { extension: owner.name, name });
}

export type Registry = {
  jobs: Map<string, Registration>;
  settings: Map<string, SettingDefinition>;
  handlers: HandlerEntry[];
  sealed: boolean;
};

export function createRegistry(): Registry {
  return { jobs: new Map(), settings: new Map(), handlers: [], sealed: false };
}

type NameRule = { pattern: RegExp; segments: string };

const jobNameRule: NameRule = { pattern: namePattern, segments: 'in lowercase kebab case' };
const settingKeyRule: NameRule = { pattern: settingKeyPattern, segments: 'with lower camelCase segments' };

function checkName(registry: Registry, owner: Owner, name: string, taken: boolean, rule: NameRule = jobNameRule): void {
  if (registry.sealed) throw invalid(owner, `"${name}" was registered after the entry returned; registrations are sealed.`, name);
  if (!rule.pattern.test(name) || !name.startsWith(`${owner.namespace}.`)) {
    throw invalid(owner, `"${name}" must be <namespace>.<segment>… ${rule.segments}, starting with "${owner.namespace}.".`, name);
  }
  if (taken) throw invalid(owner, `"${name}" is registered twice.`, name);
}

export function registerJob<Input extends z.ZodType, Output extends z.ZodType>(
  registry: Registry,
  owner: Owner,
  kind: JobKind,
  name: string,
  options: CommandRegistration<Input, Output> | QueryRegistration<Input, Output>,
  syncOnly = false,
): void {
  checkName(registry, owner, name, registry.jobs.has(name));
  const parsed = optionsSchema.safeParse(options);
  if (!parsed.success) throw invalid(owner, `the registration of "${name}" is invalid (${z.prettifyError(parsed.error)}).`, name);
  const retries = 'retries' in options ? options.retries : undefined;
  registry.jobs.set(name, {
    kind,
    name,
    owner: owner.name,
    description: parsed.data.description,
    input: options.input,
    output: options.output,
    start: (input) => {
      const parsed = options.input.safeParse(input);
      return parsed.success ? { run: () => options.handle(parsed.data) } : { error: parsed.error };
    },
    public: options.public ?? false,
    timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
    retries: kind === 'command' ? (retries ?? defaultRetries) : 0,
    maxInputBytes: options.maxInputBytes ?? defaultBytes,
    maxOutputBytes: options.maxOutputBytes ?? defaultBytes,
    syncOnly,
  });
}

export function registerSetting(registry: Registry, owner: Owner, key: string, options: SettingRegistration<z.ZodType>): void {
  checkName(registry, owner, key, registry.settings.has(key), settingKeyRule);
  const parsed = settingSchema.safeParse(options);
  if (!parsed.success) throw invalid(owner, `the setting "${key}" is invalid (${z.prettifyError(parsed.error)}).`, key);
  if (Object.hasOwn(options, 'default') && !options.schema.safeParse(options.default).success) {
    throw invalid(owner, `the default of the setting "${key}" doesn't fit its schema.`, key);
  }
  registry.settings.set(key, {
    key,
    extension: owner.name,
    description: parsed.data.description,
    schema: options.schema,
    defaultValue: Object.hasOwn(options, 'default') ? { value: options.default } : undefined,
    scopes: options.scopes ?? ['global', 'workspace'],
  });
}
