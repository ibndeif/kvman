import { readFileSync } from 'node:fs';
import { defineExtension, z, type Ctx } from '@kvman/sdk';

const exitSchema = z.object({
  processId: z.string(),
  reason: z.string(),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  logBlobId: z.string(),
  tail: z.string(),
  truncated: z.boolean(),
  durationMs: z.number(),
});

async function appendLine(ctx: Ctx, line: string): Promise<void> {
  const missing = await ctx.files.stat('runs.txt');
  const current = missing === undefined ? '' : await ctx.files.read('runs.txt');
  await ctx.files.write('runs.txt', `${current}${line}\n`);
}

// Probe exercises the test kernel: senders, recorders, crashes, processes, blobs, and catalogs (M2.13).
export default defineExtension({
  name: '@acme/probe',
  namespace: 'probe',
  title: '$t.title',
  summary: '$t.summary',
  description: 'Probes the test kernel for the M2.13 scenarios.',
}, (ext) => {
  ext.requestIsolation('shared', { reason: 'Runs in the test kernel in both modes.' });
  ext.requestCapability('ui', { reason: 'Shows a toast and a notification.' });
  ext.requestCapability('process', { reason: 'Spawns processes.' });
  ext.requestCapability('files.read', { reason: 'Reads the workspace files.' });
  ext.requestCapability('files.write', { reason: 'Appends to the workspace runs file.' });
  ext.requestCapability('calls', { reason: 'Relays to the other extension.', types: ['other.*'] });
  ext.registerError('probe/NOPE', { description: 'Fails when the test asks it to.', title: 'Probe refused on purpose' });
  ext.registerEvent('probe.pinged', {
    description: 'Probe was pinged and committed its answer.',
    delivery: 'durable',
    payload: z.object({ explode: z.boolean() }),
  });
  ext.registerEvent('probe.noticed', {
    description: 'Probe was noticed while answering a ping.',
    delivery: 'transient',
    payload: z.object({}),
  });
  ext.registerLog('exits', { description: 'How the detached processes ended.', entry: exitSchema });
  ext.subscribe('probe.pinged', {
    description: 'Fails with an unregistered code when the ping explodes.',
    handle: (payload, ctx) => {
      if (typeof payload === 'object' && payload !== null && !Array.isArray(payload) && payload['explode'] === true) {
        throw ctx.problem('probe/UNLISTED');
      }
      return Promise.resolve();
    },
  });
  ext.registerCommand('probe.echo', {
    description: 'Answers its text with the locale and greeting.',
    input: z.object({ text: z.string() }),
    handle: async ({ text }, ctx) => ({ text, locale: ctx.locale, greeting: ctx.i18n.t('greeting', { name: text }) }),
  });
  ext.registerCommand('probe.admin', {
    description: 'Only a person may call it.', access: 'user', input: z.object({}), handle: async () => ({}),
  });
  ext.registerCommand('probe.hidden', {
    description: 'Only Probe and the kernel may call it.', access: 'internal', input: z.object({}), handle: async () => ({}),
  });
  ext.registerCommand('probe.api', {
    description: 'Only extensions and their processes may call it.', access: 'extensions', input: z.object({}), handle: async () => ({}),
  });
  ext.registerCommand('probe.fail', {
    description: 'Fails with the error code it is given.',
    input: z.object({ code: z.string() }),
    handle: async ({ code }, ctx) => {
      throw ctx.problem(code);
    },
  });
  ext.registerCommand('probe.broken', {
    description: 'Throws an unexpected error once, without retrying.',
    input: z.object({}), maxAttempts: 1,
    handle: async () => {
      throw new Error('probe broke');
    },
  });
  ext.registerCommand('probe.ping', {
    description: 'Publishes that it was pinged and noticed.',
    input: z.object({ explode: z.boolean().optional() }),
    handle: async (input, ctx) => {
      ctx.publish('probe.pinged', { explode: input.explode ?? false });
      ctx.publish('probe.noticed', {});
      return {};
    },
  });
  ext.registerCommand('probe.ping-fail', {
    description: 'Publishes a ping and then fails, so nothing commits.',
    input: z.object({}),
    handle: async (_input, ctx) => {
      ctx.publish('probe.pinged', { explode: false });
      throw ctx.problem('probe/NOPE');
    },
  });
  ext.registerCommand('probe.toast', {
    description: 'Shows a toast and stores a notification.',
    input: z.object({}),
    handle: async (_input, ctx) => {
      ctx.ui.toast({ text: '$t.toast.done' });
      ctx.ui.notify({ title: '$t.toast.done', key: 'k1' });
      return {};
    },
  });
  ext.registerCommand('probe.chain', {
    description: 'Sends itself with a smaller depth until it reaches zero.',
    input: z.object({ depth: z.number().int() }),
    handle: async ({ depth }, ctx) => {
      if (depth <= 0) ctx.store.kv.set('reached', true);
      else ctx.send('probe.chain', { depth: depth - 1 });
      return {};
    },
  });
  ext.registerCommand('probe.steps', {
    description: 'Runs two journaled steps and answers their result.',
    input: z.object({}),
    handle: async (_input, ctx) => {
      const value = await ctx.step('extract', async () => {
        await appendLine(ctx, 'extract');
        return 7;
      });
      await ctx.step('store', async () => {
        await appendLine(ctx, 'store');
        return null;
      });
      ctx.store.kv.set('result', value);
      return { value };
    },
  });
  ext.registerCommand('probe.spawn', {
    description: 'Spawns a process and waits for it, unless detached.',
    input: z.object({ command: z.string(), args: z.array(z.string()).optional(), detached: z.boolean().optional() }),
    handle: async (input, ctx) => {
      const options = {
        command: input.command,
        ...(input.args === undefined ? {} : { args: input.args }),
        ...(input.detached === undefined ? {} : { detached: input.detached }),
        ...(input.detached === true ? { onExit: 'probe.exited' } : {}),
      };
      const spawned = await ctx.process.spawn(options);
      if (input.detached === true) return { processId: spawned.processId };
      return spawned.wait();
    },
  });
  ext.registerCommand('probe.exited', {
    description: 'Records how a detached process ended.', access: 'internal', input: exitSchema,
    handle: async (input, ctx) => {
      await ctx.store.log('exits').append(input);
      return {};
    },
  });
  ext.registerCommand('probe.blob', {
    description: 'Answers the text of the blob it is given.',
    input: z.object({ blobId: z.blobId() }),
    handle: async ({ blobId }, ctx) => ctx.store.blobs.text(blobId),
  });
  ext.registerCommand('probe.relay', {
    description: 'Calls the type it is given and lets its problem propagate.',
    input: z.object({ type: z.string() }),
    handle: async ({ type }, ctx) => ctx.command(type, {}),
  });
  ext.registerQuery('probe.state.get', {
    description: 'Answers the stored values, the exits, the runs file, and the workspace path.',
    input: z.object({}),
    output: z.object({
      values: z.record(z.string(), z.unknown()),
      exits: z.array(z.unknown()),
      runs: z.array(z.string()),
      workspacePath: z.string(),
    }),
    handle: async (_input, ctx) => {
      const values: Record<string, unknown> = {};
      for (const entry of await ctx.store.kv.list('')) values[entry.key] = entry.value;
      const exits = (await ctx.store.log('exits').read()).map((entry) => entry.value);
      const missing = await ctx.files.stat('runs.txt');
      const runs = missing === undefined ? [] : (await ctx.files.read('runs.txt')).split('\n').filter((line) => line.length > 0);
      return { values, exits, runs, workspacePath: ctx.workspace?.path ?? '' };
    },
  });
  ext.registerCommand('probe.peek', {
    description: 'Answers the length of a file read outside every kvman API.',
    input: z.object({ path: z.string() }),
    output: z.number(),
    handle: async ({ path }) => readFileSync(path).length,
  });
  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Probe', summary: 'Probes the test kernel.', greeting: 'Hello {name}', toast: { done: 'Done' } },
      ar: { title: 'مسبار', summary: 'يفحص نواة الاختبار.', greeting: 'مرحبا {name}', toast: { done: 'تم' } },
    },
  });
});
