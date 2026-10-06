import { z, type Ctx } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import { slashRegisterSchema } from '../schemas/registry.ts';
import { records, txRecords } from '../store/collections.ts';
import { callerExtension, loadedOwners, ownsPublicCommand, registrations } from './loaded.ts';

// Slash commands (plan 08 §8.4, ADR 0027, 8): commands other extensions add to the send box, kept in kvcoder's global
// store for one run, owned by their registering extension.

export const ownSlashCommands = ['compact', 'export', 'fork', 'new', 'prompt', 'rename'] as const;

const slashRowSchema = z.object({ name: z.string(), description: z.string(), command: z.string(), message: z.string().exactOptional(), owner: z.string() });

export function registerSlashCommands(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.slash.register', {
    description: "Registers slash commands of the send box, each running one of the caller's public commands.",
    input: slashRegisterSchema,
    output: z.object({}),
    public: true,
    handle: async ({ commands }) => {
      const owner = callerExtension(ctx, 'slash commands');
      const own = commands.find((command) => ownSlashCommands.some((name) => name === command.name));
      if (own !== undefined) throw ctx.problem('kvcoder/NAME_TAKEN', { name: own.name, owner: '@kvman/kvcoder' });
      const repeated = commands.find((command, index) => commands.findIndex((other) => other.name === command.name) !== index);
      if (repeated !== undefined) throw invalid(`The slash command ${repeated.name} is given twice.`, { name: repeated.name });
      const rows = await registrations(ctx);
      const foreign = commands.find((command) => !ownsPublicCommand(rows, owner, command.command));
      if (foreign !== undefined) throw invalid(`${foreign.command} isn't a public command of ${owner}.`, { command: foreign.command });
      const taken = await ctx.store.transaction((tx) => {
        const stored = txRecords(tx).slashCommands;
        const existing = commands.map((command) => stored.find({ name: command.name }, { limit: 1 })[0]);
        const other = existing.find((doc) => doc !== undefined && doc.owner !== owner);
        if (other !== undefined) return { name: other.name, owner: other.owner };
        for (const doc of existing) if (doc !== undefined) stored.delete(doc.id);
        for (const command of commands) stored.insert({ owner, name: command.name, description: command.description, command: command.command, message: command.message ?? null });
        return undefined;
      });
      if (taken !== undefined) throw ctx.problem('kvcoder/NAME_TAKEN', taken);
      return {};
    },
  });
  ctx.registerCommand('kvcoder.slash.unregister', {
    description: "Removes one of the caller's slash commands.",
    input: z.object({ name: z.string().min(1) }),
    output: z.object({}),
    public: true,
    handle: async ({ name }) => {
      const owner = callerExtension(ctx, 'slash commands');
      const { slashCommands } = records(ctx.store);
      const [existing] = await slashCommands.find({ name }, { limit: 1 });
      if (existing !== undefined && existing.owner !== owner) throw ctx.problem('kvcoder/NAME_TAKEN', { name, owner: existing.owner });
      if (existing !== undefined) await slashCommands.delete(existing.id);
      return {};
    },
  });
  ctx.registerQuery('kvcoder.slash.list', {
    description: 'Lists the slash commands that extensions added to the send box.',
    input: z.object({}),
    output: z.array(slashRowSchema),
    public: true,
    handle: async () => {
      const stored = await records(ctx.store).slashCommands.find({}, { limit: 1000 });
      const loaded = await loadedOwners(ctx, stored.map((doc) => doc.owner));
      return stored
        .filter((doc) => loaded.has(doc.owner))
        .sort((first, second) => first.name.localeCompare(second.name))
        .map((doc) => ({ name: doc.name, description: doc.description, command: doc.command, ...(doc.message === null ? {} : { message: doc.message }), owner: doc.owner }));
    },
  });
}

/** Clears the slash commands at kvcoder's start; extensions register theirs again in their own handlers. */
export async function clearSlashCommands(ctx: Ctx): Promise<void> {
  const { slashCommands } = records(ctx.store);
  for (let found = await slashCommands.find({}, { limit: 1000 }); found.length > 0; found = await slashCommands.find({}, { limit: 1000 })) {
    for (const command of found) await slashCommands.delete(command.id);
  }
}
