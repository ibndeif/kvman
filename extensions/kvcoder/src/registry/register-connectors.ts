import { z, type Ctx } from '@kvman/sdk';
import { builtinConnectors } from '../connector-call.ts';
import { invalid } from '../problems.ts';
import { disabledConnectors, settingSchemas } from '../register-settings.ts';
import { connectorRegisterSchema, connectorSchema, exampleSchema, type ConnectorDoc } from '../schemas/registry.ts';
import { records, txRecords, type TxRecords } from '../store/collections.ts';
import { ownSession } from '../sessions/session-lookup.ts';
import { callerExtension, loadedOwners, ownsPublicCall, registrations, type Registrations } from './loaded.ts';

// Connectors (plan 08 §8.4): named sets of commands the agent runs with `run`, registered by other extensions, kept in
// kvcoder's global store for one run, and owned by their registering extension. One registered with `optIn: true` is
// off in every chat until the owner enables it for that chat (ADR 0027, 10).

const connectorRowSchema = z.object({
  name: z.string(),
  description: z.string(),
  owner: z.string(),
  kind: z.enum(['commands', 'binary']),
  commands: z.array(z.object({ name: z.string(), command: z.string(), examples: z.array(exampleSchema), asks: z.boolean(), query: z.boolean(), card: z.string().exactOptional() })).exactOptional(),
  binary: z.object({ check: z.string(), install: z.string().exactOptional(), help: z.string().exactOptional() }).exactOptional(),
  optIn: z.boolean(),
});

export type ConnectorRow = z.output<typeof connectorRowSchema>;

function rowOf(doc: ConnectorDoc): ConnectorRow {
  return {
    name: doc.name,
    description: doc.description,
    owner: doc.owner,
    kind: doc.kind,
    optIn: doc.optIn,
    ...(doc.commands === null ? {} : { commands: doc.commands.map(({ card, ...command }) => (card === null ? command : { ...command, card })) }),
    ...(doc.binary === null ? {} : { binary: { check: doc.binary.check, ...(doc.binary.install === null ? {} : { install: doc.binary.install }), ...(doc.binary.help === null ? {} : { help: doc.binary.help }) } }),
  };
}

export type ConnectorPreparation = { loaded: ReadonlySet<string>; binaries: ConnectorRow[] };

/** Kernel/settings preparation only; registry rows must be reread after these awaits (ADR0044). */
export async function prepareConnectors(ctx: Ctx): Promise<ConnectorPreparation> {
  const stored = await records(ctx.store).connectors.find({}, { limit: 1000 });
  const loaded = await loadedOwners(ctx, stored.map(doc => doc.owner));
  const configured = settingSchemas.connectors.parse(await ctx.settings.get('kvcoder.connectors'));
  const binaries = configured.map(entry => ({ name: entry.name, description: entry.description, owner: 'kvcoder.connectors', kind: 'binary' as const, binary: entry.binary, optIn: false }));
  return { loaded, binaries };
}

/** Fresh rows in the caller's final transaction, never the rows preceding metadata awaits. */
export function connectorsInTx(store: TxRecords, prepared: ConnectorPreparation): ConnectorRow[] {
  const registered = store.connectors.find({}, { limit: 1000 }).filter(doc => prepared.loaded.has(doc.owner)).map(rowOf);
  const names = new Set([...builtinConnectors, ...registered.map(connector => connector.name)]);
  return [...registered, ...prepared.binaries.filter(connector => !names.has(connector.name))];
}

/** Every connector the agent may use: registered ones whose owner is loaded, then the setting's binary connectors. */
export async function activeConnectors(ctx: Ctx): Promise<ConnectorRow[]> {
  const prepared = await prepareConnectors(ctx);
  const connectors = await ctx.store.transaction(tx => connectorsInTx(txRecords(tx), prepared));
  for (const entry of prepared.binaries) {
    if (!connectors.some(connector => connector.name === entry.name && connector.owner === entry.owner)) ctx.log.warn('A binary connector from kvcoder.connectors has a registered name and is ignored.', { name: entry.name });
  }
  return connectors;
}

type Connector = z.output<typeof connectorSchema>;

// Whether a command's target is a query is kept, so a read-only worker's helper may run it (ADR 0082, 3).
const isQuery = (rows: Registrations, name: string): boolean => rows.some((row) => row.name === name && row.kind === 'query');

const docOf = (input: Connector, rows: Registrations): Omit<ConnectorDoc, 'owner'> =>
  'commands' in input
    ? { name: input.name, description: input.description, kind: 'commands', commands: input.commands.map((command) => ({ name: command.name, command: command.command, examples: command.examples ?? [], asks: command.asks === true, query: isQuery(rows, command.command), card: command.card ?? null })), binary: null, optIn: input.optIn === true }
    : { name: input.name, description: input.description, kind: 'binary', commands: null, binary: { check: input.binary.check, install: input.binary.install ?? null, help: input.binary.help ?? null }, optIn: input.optIn === true };

// Every connector of a call is checked before any is stored, and they are stored in one transaction, so a call
// registers all of its connectors or none (ADR 0011, 26).
async function register(ctx: Ctx, connectors: readonly Connector[]): Promise<void> {
  const owner = callerExtension(ctx, 'connectors');
  const builtin = connectors.find((connector) => builtinConnectors.some((name) => name === connector.name));
  if (builtin !== undefined) throw ctx.problem('kvcoder/NAME_TAKEN', { name: builtin.name, owner: '@kvman/kvcoder' });
  const repeated = connectors.find((connector, index) => connectors.findIndex((other) => other.name === connector.name) !== index);
  if (repeated !== undefined) throw invalid(`The connector ${repeated.name} is given twice.`, { name: repeated.name });
  const commands = connectors.flatMap((connector) => ('commands' in connector ? connector.commands : []));
  const rows = commands.length > 0 ? await registrations(ctx) : [];
  const foreign = commands.find((command) => !ownsPublicCall(rows, owner, command.command));
  if (foreign !== undefined) throw invalid(`${foreign.command} isn't a public command or query of ${owner}.`, { command: foreign.command });
  // A card is a component of the same extension as its command (ADR 0082, 13).
  const strayCard = commands.find((command) => command.card !== undefined && !command.card.startsWith(`${command.command.split('.')[0] ?? ''}.`));
  if (strayCard !== undefined) throw invalid(`The card ${strayCard.card ?? ''} isn't a component of ${strayCard.command}'s extension.`, { card: strayCard.card ?? '' });
  const taken = await ctx.store.transaction((tx) => {
    const stored = txRecords(tx).connectors;
    const existing = connectors.map((connector) => stored.find({ name: connector.name }, { limit: 1 })[0]);
    const other = existing.find((doc) => doc !== undefined && doc.owner !== owner);
    if (other !== undefined) return { name: other.name, owner: other.owner };
    for (const doc of existing) if (doc !== undefined) stored.delete(doc.id);
    for (const connector of connectors) stored.insert({ ...docOf(connector, rows), owner });
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
  ctx.registerCommand('kvcoder.connector.enable', {
    description: "Switches the caller's own optIn connectors on for one chat.",
    input: z.object({ sessionId: z.string().min(1), names: z.array(z.string().min(1)).min(1) }),
    output: z.object({}),
    public: true,
    handle: async ({ sessionId, names }) => {
      const owner = callerExtension(ctx, 'connectors');
      await ownSession(ctx, sessionId);
      const stored = await records(ctx.store).connectors.find({}, { limit: 1000 });
      for (const name of names) {
        const doc = stored.find((candidate) => candidate.name === name);
        if (doc === undefined || doc.owner !== owner || doc.optIn !== true) throw invalid(`${name} isn't an optIn connector of ${owner}.`, { name });
      }
      await ctx.store.transaction((tx) => {
        const sessions = txRecords(tx).sessions;
        const current = sessions.get(sessionId);
        if (current === undefined) throw ctx.problem('kvcoder/SESSION_NOT_FOUND', { sessionId });
        sessions.update(sessionId, { optedIn: [...new Set([...current.optedIn, ...names])] });
      });
      return {};
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
