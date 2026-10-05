import { z, type Ctx } from '@kvman/sdk';
import type { JsonValue } from '../connector-call.ts';
import { sessionPointSchema, type SessionPoint } from '../schemas/registry.ts';
import { invalid } from '../problems.ts';
import { records, txRecords } from '../store/collections.ts';
import { callerExtension, loadedOwners, ownsPublicCommand, registrations } from './loaded.ts';

// Session points (plan 08 §8.4): an extension has one of its public commands queued when something happens to a
// session. Each runs inside kvcoder's own job, `kvcoder.handler.run`, which records its id before the command runs, so
// a message the command injects (its `rootId` is that id) is always recognized and starts no turn.

const week = 7 * 24 * 3_600_000;

/** Queues one job per handler registered for `point`, and remembers their ids. */
export async function firePoint(ctx: Ctx, point: SessionPoint, input: Record<string, JsonValue>): Promise<void> {
  const store = records(ctx.store);
  const handlers = await store.handlers.find({ point }, { limit: 1000 });
  if (handlers.length === 0) return;
  const loaded = await loadedOwners(ctx, handlers.map((entry) => entry.owner));
  for (const handler of handlers.filter((entry) => loaded.has(entry.owner))) await ctx.execAsync('kvcoder.handler.run', { command: handler.command, input });
}

/** Whether the running job descends from a handler job kvcoder queued. */
export async function fromSessionHandler(ctx: Ctx): Promise<boolean> {
  return (await records(ctx.store).handlerJobs.count({ jobId: ctx.job.rootId })) > 0;
}

export function registerSessionPoints(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.handler.run', {
    description: "Runs a session handler's command, remembering its job so the handler's injections start no turn.",
    input: z.object({ command: z.string(), input: z.record(z.string(), z.json()) }),
    output: z.object({}),
    handle: async ({ command, input }) => {
      await records(ctx.store).handlerJobs.insert({ jobId: ctx.job.id, at: Date.now() });
      await ctx.exec(command, input);
      return {};
    },
  });
  ctx.registerCommand('kvcoder.handler.register', {
    description: "Registers one of the caller's public commands to be queued at a session point.",
    input: z.object({ point: z.string(), command: z.string().min(1) }),
    output: z.object({}),
    public: true,
    handle: async ({ point, command }) => {
      const owner = callerExtension(ctx, 'session handlers');
      const known = sessionPointSchema.safeParse(point);
      if (!known.success) throw invalid(`There is no session point ${point}.`, { point });
      if (!ownsPublicCommand(await registrations(ctx), owner, command)) throw invalid(`${command} isn't a public command of ${owner}.`, { command });
      await ctx.store.transaction((tx) => {
        const { handlers } = txRecords(tx);
        for (const old of handlers.find({ point: known.data, owner }, { limit: 1 })) handlers.delete(old.id);
        handlers.insert({ owner, point: known.data, command });
      });
      return {};
    },
  });
  ctx.registerCommand('kvcoder.handler.unregister', {
    description: "Removes the caller's handler of a session point; each extension has its own.",
    input: z.object({ point: sessionPointSchema }),
    output: z.object({}),
    public: true,
    handle: async ({ point }) => {
      const owner = callerExtension(ctx, 'session handlers');
      const { handlers } = records(ctx.store);
      for (const own of await handlers.find({ point, owner }, { limit: 1 })) await handlers.delete(own.id);
      return {};
    },
  });
  ctx.registerQuery('kvcoder.handler.list', {
    description: 'Lists the session handlers.',
    input: z.object({}),
    output: z.array(z.object({ point: sessionPointSchema, command: z.string(), owner: z.string() })),
    public: true,
    handle: async () => (await records(ctx.store).handlers.find({}, { limit: 1000 })).map(({ point, command, owner }) => ({ point, command, owner })),
  });
}

/** Clears the handlers at kvcoder's start, and forgets handler-job ids older than a week (ADR 0009, 103). */
export async function clearSessionPoints(ctx: Ctx): Promise<void> {
  const store = records(ctx.store);
  for (let found = await store.handlers.find({}, { limit: 1000 }); found.length > 0; found = await store.handlers.find({}, { limit: 1000 })) {
    for (const handler of found) await store.handlers.delete(handler.id);
  }
  const cutoff = Date.now() - week;
  for (const job of await store.handlerJobs.find({}, { limit: 1000 })) if (job.at < cutoff) await store.handlerJobs.delete(job.id);
}
