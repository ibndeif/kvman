import { z, type Ctx } from '@kvman/sdk';
import { builtinConnectors } from '../connector-call.ts';
import { invalid } from '../problems.ts';
import { disabledConnectors, readSettings } from '../register-settings.ts';
import { connectorRegisterSchema, connectorSchema, exampleSchema, type ConnectorDoc } from '../schemas/registry.ts';
import { records, txRecords } from '../store/collections.ts';
import { callerExtension, loadedOwners, ownsPublicCall, registrations } from './loaded.ts';

// Connectors (plan 08 §8.4): named sets of commands the agent runs with `run`, registered by other extensions, kept in
// kvcoder's global store for one run, and owned by their registering extension.

const connectorRowSchema = z.object({
  name: z.string(),
  description: z.string(),
  owner: z.string(),
  kind: z.enum(['commands', 'binary']),
  commands: z.array(z.object({ name: z.string(), command: z.string(), examples: z.array(exampleSchema) })).exactOptional(),
  binary: z.object({ check: z.string(), install: z.string().exactOptional(), help: z.string().exactOptional() }).exactOptional(),
});

export type ConnectorRow = z.output<typeof connectorRowSchema>;

function rowOf(doc: ConnectorDoc): ConnectorRow {
  return {
    name: doc.name,
    description: doc.description,
    owner: doc.owner,
    kind: doc.kind,
    ...(doc.commands === null ? {} : { commands: doc.commands }),
    ...(doc.binary === null ? {} : { binary: { check: doc.binary.check, ...(doc.binary.install === null ? {} : { install: doc.binary.install }), ...(doc.binary.help === null ? {} : { help: doc.binary.help }) } }),
  };
}

/** Every connector the agent may use: registered ones whose owner is loaded, then the setting's binary connectors. */
export async function activeConnectors(ctx: Ctx): Promise<ConnectorRow[]> {
  const stored = await records(ctx.store).connectors.find({}, { limit: 1000 });
  const loaded = await loadedOwners(ctx, stored.map((doc) => doc.owner));
  const registered = stored.filter((doc) => loaded.has(doc.owner)).map(rowOf);
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

type Connector = z.output<typeof connectorSchema>;

const docOf = (input: Connector): Omit<ConnectorDoc, 'owner'> =>
  'commands' in input
    ? { name: input.name, description: input.description, kind: 'commands', commands: input.commands.map((command) => ({ name: command.name, command: command.command, examples: command.examples ?? [] })), binary: null }
    : { name: input.name, description: input.description, kind: 'binary', commands: null, binary: { check: input.binary.check, install: input.binary.install ?? null, help: input.binary.help ?? null } };

// Every connector of a call is checked before any is stored, and they are stored in one transaction, so a call
// registers all of its connectors or none (ADR 0011, 26).
async function register(ctx: Ctx, connectors: readonly Connector[]): Promise<void> {
  const owner = callerExtension(ctx, 'connectors');
  const builtin = connectors.find((connector) => builtinConnectors.some((name) => name === connector.name));
  if (builtin !== undefined) throw ctx.problem('kvcoder/NAME_TAKEN', { name: builtin.name, owner: '@kvman/kvcoder' });
  const repeated = connectors.find((connector, index) => connectors.findIndex((other) => other.name === connector.name) !== index);
  if (repeated !== undefined) throw invalid(`The connector ${repeated.name} is given twice.`, { name: repeated.name });
  const commands = connectors.flatMap((connector) => ('commands' in connector ? connector.commands : []));
  if (commands.length > 0) {
    const rows = await registrations(ctx);
    const foreign = commands.find((command) => !ownsPublicCall(rows, owner, command.command));
    if (foreign !== undefined) throw invalid(`${foreign.command} isn't a public command or query of ${owner}.`, { command: foreign.command });
  }
  const taken = await ctx.store.transaction((tx) => {
    const stored = txRecords(tx).connectors;
    const existing = connectors.map((connector) => stored.find({ name: connector.name }, { limit: 1 })[0]);
    const other = existing.find((doc) => doc !== undefined && doc.owner !== owner);
    if (other !== undefined) return { name: other.name, owner: other.owner };
    for (const doc of existing) if (doc !== undefined) stored.delete(doc.id);
    for (const connector of connectors) stored.insert({ ...docOf(connector), owner });
    return undefined;
  });
  if (taken !== undefined) throw ctx.problem('kvcoder/NAME_TAKEN', taken);
}

export function registerConnectors(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.connector.register', {
    description: "Registers a connector the agent calls with its run tool, or several at once: the caller's public commands, or a program run in the shell.",
    input: connectorRegisterSchema,
    output: z.object({}),
    public: true,
    handle: async (input) => {
      await register(ctx, 'connectors' in input ? input.connectors : [input]);
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
    output: z.array(connectorRowSchema.extend({ enabled: z.boolean() })),
    public: true,
    handle: async () => {
      const disabled = await disabledConnectors(ctx);
      return (await activeConnectors(ctx)).map((connector) => ({ ...connector, enabled: !disabled.has(connector.name) }));
    },
  });
}

/** Clears the connectors at kvcoder's start; extensions register theirs again in their own handlers. */
export async function clearConnectors(ctx: Ctx): Promise<void> {
  const { connectors } = records(ctx.store);
  for (let found = await connectors.find({}, { limit: 1000 }); found.length > 0; found = await connectors.find({}, { limit: 1000 })) {
    for (const connector of found) await connectors.delete(connector.id);
  }
}
