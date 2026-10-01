import { z, type Ctx } from '@kvman/sdk';
import { invalid } from '../problems.ts';

// The run's extensions, from `kernel.extensions.list`: entries whose owner isn't loaded are ignored (plan 08 §8.4).

const registrationSchema = z.object({ name: z.string(), description: z.string(), public: z.boolean(), input: z.json(), output: z.json() });

const extensionsSchema = z.array(
  z.object({
    name: z.string(),
    commands: z.array(registrationSchema),
    queries: z.array(registrationSchema),
  }),
);

export type LoadedExtensions = z.output<typeof extensionsSchema>;

export async function loadedExtensions(ctx: Ctx): Promise<LoadedExtensions> {
  return extensionsSchema.parse(await ctx.exec('kernel.extensions.list', {}));
}

/** Whether `command` is a public command of the extension `owner`. */
export function ownsPublicCommand(extensions: LoadedExtensions, owner: string, command: string): boolean {
  return extensions.some((extension) => extension.name === owner && extension.commands.some((registered) => registered.name === command && registered.public));
}

/** Whether `name` is a public command or query of the extension `owner`: what a connector command may run (ADR 0009, 129). */
export function ownsPublicCall(extensions: LoadedExtensions, owner: string, name: string): boolean {
  return extensions.some((extension) => extension.name === owner && [...extension.commands, ...extension.queries].some((registered) => registered.name === name && registered.public));
}

/** Whether `name` is a query of a loaded extension. */
export function isQuery(extensions: LoadedExtensions, name: string): boolean {
  return extensions.some((extension) => extension.queries.some((registered) => registered.name === name));
}

/** Every command and query of the run, as connector help reads them. */
export function callInfos(extensions: LoadedExtensions): LoadedExtensions[number]['commands'] {
  return extensions.flatMap((extension) => [...extension.commands, ...extension.queries]);
}

/** The caller's package name; only an extension registers with kvcoder. */
export function callerExtension(ctx: Ctx, what: string): string {
  const caller = ctx.job.caller;
  if (caller.kind !== 'extension') throw invalid(`Only an extension registers ${what}.`);
  return caller.name;
}
