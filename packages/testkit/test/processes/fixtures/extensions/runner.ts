import type { Json } from '@kvman/protocol';
import { defineExtension, z, type Ctx } from '@kvman/sdk';
import { attempt } from './attempts.ts';
import { optionsOf, spawnInput } from './spawn-options.ts';

// `before` spawns other processes first (without waiting), so one invocation owns several.
const runInput = z.object({
  spawn: spawnInput, before: z.array(spawnInput).optional(), wait: z.boolean().optional(), waitTwice: z.boolean().optional(), read: z.boolean().optional(),
});

async function run(ctx: Ctx, input: z.infer<typeof runInput>): Promise<Json> {
  for (const other of input.before ?? []) await ctx.process.spawn(optionsOf(other));
  const handle = await ctx.process.spawn(optionsOf(input.spawn));
  if (input.wait !== true && input.waitTwice !== true) return { processId: handle.processId };
  const result = await handle.wait();
  const again = input.waitTwice === true ? { again: await handle.wait() } : {};
  const blobs = ctx.workspace === undefined ? ctx.store.global.blobs : ctx.store.blobs;
  const log = input.read === true ? { log: await blobs.text(result.logBlobId) } : {};
  return { processId: handle.processId, result, ...again, ...log };
}

function envelopeOf(ctx: Ctx): Json {
  const { message } = ctx;
  return {
    source: message.source, context: message.context, priority: message.priority, correlationId: message.correlationId, causationId: message.causationId ?? null,
    deadlineAt: message.deadlineAt ?? null, idempotencyKey: message.idempotencyKey ?? null, workspaceId: message.workspaceId ?? null,
  };
}

// Spawns and supervises processes for the M2.6 tests (03 §3.7, ADR 0139), and offers the types their kv calls reach.
export default defineExtension({ name: '@acme/runner', namespace: 'runner', title: 'Runner', description: 'Spawns processes.' }, (ext) => {
  ext.requestCapability('process', { reason: 'Runs processes.' });
  ext.registerEvent('runner.output.written', { description: 'Process output as it streams.', delivery: 'live', chunk: 'text' });
  ext.registerError('runner/FAILED', { description: 'Fails on request.', title: 'The runner failed' });
  ext.registerCommand('runner.run', { description: 'Spawns a process, and waits for it when asked.', input: runInput, handle: async (input, ctx) => attempt(() => run(ctx, input)) });
  ext.registerCommand('runner.hold', {
    description: 'Spawns and waits, with a one-second handler timeout.', input: runInput, timeoutMs: 1000, maxAttempts: 1, handle: async (input, ctx) => attempt(() => run(ctx, input)),
  });
  ext.registerCommand('runner.global.run', { description: 'Spawns without a workspace.', input: runInput, scope: 'global', handle: async (input, ctx) => attempt(() => run(ctx, input)) });
  ext.registerQuery('runner.probe.get', {
    description: 'Tries a spawn in a query.', input: z.object({}), output: z.unknown(), handle: async (_input, ctx) => attempt(() => run(ctx, { spawn: { command: 'true' } })),
  });
  ext.registerCommand('runner.kill', {
    description: 'Kills a process of Runner.', input: z.object({ processId: z.string() }),
    handle: async ({ processId }, ctx) => attempt(async () => {
      await ctx.process.kill(processId);
      return 'killed';
    }),
  });
  ext.registerCommand('runner.finish', {
    description: 'Records how a detached process ended.', access: 'internal',
    input: z.object({
      processId: z.string(), reason: z.string(), exitCode: z.number().nullable(), signal: z.string().nullable(), logBlobId: z.blobId(), tail: z.string(), truncated: z.boolean(),
      durationMs: z.number(),
    }),
    handle: async (input, ctx) => {
      ctx.store.kv.set(`exit:${input.processId}`, { payload: input, log: await ctx.store.blobs.text(input.logBlobId), message: envelopeOf(ctx) });
      return {};
    },
  });
  ext.registerQuery('runner.exits.list', {
    description: 'What runner.finish recorded.', input: z.object({}), output: z.unknown(),
    handle: async (_input, ctx) => (await ctx.store.kv.list('exit:')).map((entry) => entry.value),
  });
  ext.registerCommand('runner.echo', { description: 'Echoes its text with its message envelope.', input: z.object({ text: z.string() }), handle: async ({ text }, ctx) => ({ text, message: envelopeOf(ctx) }) });
  ext.registerQuery('runner.status.get', { description: 'Answers that Runner runs.', input: z.object({}), output: z.object({ running: z.boolean() }), handle: async () => ({ running: true }) });
  ext.registerCommand('runner.reveal', { description: 'Only a person may call it.', access: 'user', input: z.object({}), handle: async () => ({}) });
  ext.registerCommand('runner.record', { description: 'Only Runner and the kernel may call it.', access: 'internal', input: z.object({}), handle: async () => ({}) });
  ext.registerCommand('runner.serve', { description: 'Only extensions and their processes may call it.', access: 'extensions', input: z.object({}), handle: async () => ({}) });
  ext.registerCommand('runner.defer', { description: 'Defers its reply.', input: z.object({}), handle: async (_input, ctx) => ctx.defer() });
  ext.registerCommand('runner.fail', { description: 'Fails with runner/FAILED.', input: z.object({}), handle: async (_input, ctx) => { throw ctx.problem('runner/FAILED'); } });
});
