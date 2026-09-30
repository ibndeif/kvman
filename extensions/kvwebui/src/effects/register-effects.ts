import { z, type Ctx, type Transaction, type TransactionCollection } from '@kvman/sdk';
import { effectSchema, type Effect } from './effect-schema.ts';
import { jobIdTime } from './effect-time.ts';

// Effects in kvwebui's global store (plan 06 §6.5, ADR 0008, 57): kept under the adding job's root id, taken (returned
// and deleted) once by the UI, and cleaned hourly when older than an hour (ADR 0009, 87).

const storedSchema = z.object({ rootId: z.string(), at: z.number(), effect: effectSchema });

type Stored = z.output<typeof storedSchema>;

const hour = 3_600_000;

const effectsOf = (tx: Transaction) => tx.global.collection('effects', storedSchema);
const page = 1000;

function takeAll(effects: TransactionCollection<Stored>, rootId: string): Effect[] {
  const taken: Effect[] = [];
  for (let found = effects.find({ rootId }, { limit: page }); found.length > 0; found = effects.find({ rootId }, { limit: page })) {
    for (const stored of found) {
      effects.delete(stored.id);
      taken.push(stored.effect);
    }
  }
  return taken;
}

// Pages come oldest first, in the order the effects were added; a page that keeps a young effect ends the sweep.
function cleanOlderThan(effects: TransactionCollection<Stored>, cutoff: number): void {
  for (let found = effects.find({}, { limit: page }); found.length > 0; found = effects.find({}, { limit: page })) {
    const old = found.filter((stored) => stored.at < cutoff);
    for (const stored of old) effects.delete(stored.id);
    if (old.length < found.length) return;
  }
}

export function registerEffects(ctx: Ctx): void {
  ctx.registerCommand('kvwebui.effect.add', {
    description: "Adds an effect that the UI applies when the job it started or follows ends.",
    input: effectSchema,
    output: z.object({}),
    public: true,
    handle: async (effect) => {
      await ctx.store.global.collection('effects', storedSchema).insert({ rootId: ctx.job.rootId, at: jobIdTime(ctx.job.rootId), effect });
      return {};
    },
  });
  ctx.registerCommand('kvwebui.effect.take', {
    description: "Returns a job's effects in the order they were added, and deletes them.",
    input: z.object({ jobId: z.string().min(1) }),
    output: z.array(effectSchema),
    public: true,
    handle: ({ jobId }) => ctx.store.transaction((tx) => takeAll(effectsOf(tx), jobId)),
  });
  ctx.registerCommand('kvwebui.effect.clean', {
    description: 'Deletes the effects older than an hour.',
    input: z.object({}),
    output: z.object({}),
    handle: async () => {
      await ctx.store.transaction((tx) => cleanOlderThan(effectsOf(tx), jobIdTime(ctx.job.id) - hour));
      return {};
    },
  });
  ctx.registerHandler('kernel.started', {
    description: 'Schedules the hourly cleaning of effects.',
    handle: async () => {
      await ctx.schedule('kvwebui.effect.clean', {}, { cron: '0 * * * *', key: 'effect-clean' });
    },
  });
}
