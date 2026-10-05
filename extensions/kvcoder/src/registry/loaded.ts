import { z, type Ctx } from '@kvman/sdk';
import { invalid } from '../problems.ts';

// What the run has loaded. Who owns a name comes from `kernel.registrations.list`, which carries no schema
// (ADR 0011, 25); the schemas of `help` and of an invalid payload come from `kernel.extensions.list`. Entries whose
// owner isn't loaded are ignored (plan 08 §8.4).

const rowSchema = z.object({ name: z.string(), kind: z.enum(['command', 'query']), extension: z.string(), public: z.boolean() });

export type Registrations = z.output<typeof rowSchema>[];

/** Every command and query of the run, with its owner. */
export async function registrations(ctx: Ctx): Promise<Registrations> {
  return z.array(rowSchema).parse(await ctx.exec('kernel.registrations.list', {}));
}

/** Whether `command` is a public command of the extension `owner`. */
export function ownsPublicCommand(rows: Registrations, owner: string, command: string): boolean {
  return rows.some((row) => row.name === command && row.extension === owner && row.kind === 'command' && row.public);
}

/** Whether `name` is a public command or query of the extension `owner`: what a connector command may run (ADR 0009, 129). */
export function ownsPublicCall(rows: Registrations, owner: string, name: string): boolean {
  return rows.some((row) => row.name === name && row.extension === owner && row.public);
}

const extensionNamesSchema = z.array(z.object({ name: z.string() }));

/** Those of `owners` that are loaded. An owner with no command or query isn't in the registrations, so only then is the list of extensions read. */
export async function loadedOwners(ctx: Ctx, owners: readonly string[]): Promise<Set<string>> {
  const registered = new Set((await registrations(ctx)).map((row) => row.extension));
  if (owners.every((owner) => registered.has(owner))) return new Set(owners);
  const loaded = new Set(extensionNamesSchema.parse(await ctx.exec('kernel.extensions.list', {})).map((extension) => extension.name));
  return new Set(owners.filter((owner) => loaded.has(owner)));
}

const callInfoSchema = z.object({ name: z.string(), description: z.string(), input: z.json(), output: z.json() });
const extensionCallsSchema = z.array(z.object({ commands: z.array(callInfoSchema), queries: z.array(callInfoSchema) }));

export type CallInfo = z.output<typeof callInfoSchema>;

/** Every command and query of the run with its schemas, as connector help reads them. */
export async function callInfos(ctx: Ctx): Promise<CallInfo[]> {
  return extensionCallsSchema.parse(await ctx.exec('kernel.extensions.list', {})).flatMap((extension) => [...extension.commands, ...extension.queries]);
}

/** The caller's package name; only an extension registers with kvcoder. */
export function callerExtension(ctx: Ctx, what: string): string {
  const caller = ctx.job.caller;
  if (caller.kind !== 'extension') throw invalid(`Only an extension registers ${what}.`);
  return caller.name;
}
