import { z, type Ctx } from '@kvman/sdk';
import { builtinConnectors } from '../connector-line.ts';
import { invalid } from '../problems.ts';
import { readSettings } from '../register-settings.ts';
import { connectorRegisterSchema, exampleSchema, type ConnectorDoc } from '../schemas/registry.ts';
import { records, txRecords } from '../store/collections.ts';
import { callerExtension, loadedExtensions, ownsPublicCall } from './loaded.ts';

// Connectors (plan 08 §8.4): words the agent types in its shell, registered by other extensions, kept in kvcoder's
// global store for one run, and owned by their registering extension.

const connectorRowSchema = z.object({
  name: z.string(),
  description: z.string(),
  owner: z.string(),
  kind: z.enum(['commands', 'binary']),
  commands: z.array(z.object({ name: z.string(), command: z.string(), examples: z.array(exampleSchema) })).exactOptional(),
  binary: z.object({ check: z.string(), install: z.string().exactOptional() }).exactOptional(),
});

export type ConnectorRow = z.output<typeof connectorRowSchema>;

function rowOf(doc: ConnectorDoc): ConnectorRow {
  return {
    name: doc.name,
    description: doc.description,
    owner: doc.owner,
    kind: doc.kind,
    ...(doc.commands === null ? {} : { commands: doc.commands }),
    ...(doc.binary === null ? {} : { binary: { check: doc.binary.check, ...(doc.binary.install === null ? {} : { install: doc.binary.install }) } }),
  };
}

/** Every connector the agent may use: registered ones whose owner is loaded, then the setting's binary connectors. */
export async function activeConnectors(ctx: Ctx): Promise<ConnectorRow[]> {
  const loaded = new Set((await loadedExtensions(ctx)).map((extension) => extension.name));
  const registered = (await records(ctx.store).connectors.find({}, { limit: 1000 })).filter((doc) => loaded.has(doc.owner)).map(rowOf);
  const names = new Set(registered.map((connector) => connector.name));
  const fromSetting: ConnectorRow[] = [];
  for (const entry of (await readSettings(ctx)).connectors) {
    if (names.has(entry.name) || builtinConnectors.some((name) => name === entry.name)) {
      ctx.log.warn('A binary connector from kvcoder.connectors has a registered name and is ignored.', { name: entry.name });
      continue;
    }
    fromSetting.push({ name: entry.name, description: entry.description, owner: 'kvcoder.connectors', kind: 'binary', binary: entry.binary });
  }
  return [...registered, ...fromSetting];
}

async function register(ctx: Ctx, input: z.output<typeof connectorRegisterSchema>): Promise<void> {
  const owner = callerExtension(ctx, 'connectors');
  if (builtinConnectors.some((name) => name === input.name)) throw ctx.problem('kvcoder/NAME_TAKEN', { name: input.name, owner: '@kvman/kvcoder' });
  if ('commands' in input) {
    const extensions = await loadedExtensions(ctx);
    const foreign = input.commands.find((command) => !ownsPublicCall(extensions, owner, command.command));
    if (foreign !== undefined) throw invalid(`${foreign.command} isn't a public command or query of ${owner}.`, { command: foreign.command });
  }
  const doc: Omit<ConnectorDoc, 'owner'> =
    'commands' in input
      ? { name: input.name, description: input.description, kind: 'commands', commands: input.commands.map((command) => ({ name: command.name, command: command.command, examples: command.examples ?? [] })), binary: null }
      : { name: input.name, description: input.description, kind: 'binary', commands: null, binary: { check: input.binary.check, install: input.binary.install ?? null } };
  const taken = await ctx.store.transaction((tx) => {
    const { connectors } = txRecords(tx);
    const [existing] = connectors.find({ name: input.name }, { limit: 1 });
    if (existing !== undefined && existing.owner !== owner) return existing.owner;
    if (existing !== undefined) connectors.delete(existing.id);
    connectors.insert({ ...doc, owner });
    return undefined;
  });
  if (taken !== undefined) throw ctx.problem('kvcoder/NAME_TAKEN', { name: input.name, owner: taken });
}

export function registerConnectors(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.connector.register', {
    description: 'Registers a connector: a word the agent types to run the caller\'s public commands, or a program it runs in the shell.',
    input: connectorRegisterSchema,
    output: z.object({}),
    public: true,
    handle: async (input) => {
      await register(ctx, input);
      return {};
    },
  });
  ctx.registerCommand('kvcoder.connector.unregister', {
    description: "Removes one of the caller's connectors.",
    input: z.object({ name: z.string().min(1) }),
    output: z.object({}),
    public: true,
    handle: async ({ name }) => {
      const owner = callerExtension(ctx, 'connectors');
      const { connectors } = records(ctx.store);
      const [existing] = await connectors.find({ name }, { limit: 1 });
      if (existing !== undefined && existing.owner !== owner) throw ctx.problem('kvcoder/NAME_TAKEN', { name, owner: existing.owner });
      if (existing !== undefined) await connectors.delete(existing.id);
      return {};
    },
  });
  ctx.registerQuery('kvcoder.connector.list', {
    description: 'Lists the connectors the agent may use.',
    input: z.object({}),
    output: z.array(connectorRowSchema),
    public: true,
    handle: () => activeConnectors(ctx),
  });
}

/** Clears the connectors at kvcoder's start; extensions register theirs again in their own handlers. */
export async function clearConnectors(ctx: Ctx): Promise<void> {
  const { connectors } = records(ctx.store);
  for (let found = await connectors.find({}, { limit: 1000 }); found.length > 0; found = await connectors.find({}, { limit: 1000 })) {
    for (const connector of found) await connectors.delete(connector.id);
  }
}
