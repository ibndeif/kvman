// The `path:` extension CLI tests run: public commands and queries to call over HTTP, gates that hold a job until the
// test releases it (`app.release`), records of `kernel.job.cancelled`, a `kernel.stopping` handler that can be held,
// and a long-lived process. A gate is a store flag plus a BroadcastChannel, so releasing before or after the job waits
// both work, and `app.waiting` tells the test the job is at its gate.

export const appEntry = `
import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  const gate = z.object({ gate: z.string() });
  const empty = z.object({});
  const cancelledSchema = z.object({ jobId: z.string(), name: z.string(), reason: z.string() });
  const cancelled = () => ctx.store.global.collection('cancelled', cancelledSchema);

  const waitAt = async (name: string): Promise<void> => {
    const channel = new BroadcastChannel('app-gate:' + name);
    let released = false;
    let open = (): void => undefined;
    channel.onmessage = () => {
      released = true;
      open();
    };
    try {
      await ctx.store.global.kv.set('waiting:' + name, true);
      if ((await ctx.store.global.kv.get('gate:' + name)) === true) return;
      await new Promise<void>((resolve, reject) => {
        open = resolve;
        if (released) resolve();
        const stop = () => reject(new Error('The job was stopped at its gate.'));
        if (ctx.job.signal.aborted) stop();
        ctx.job.signal.addEventListener('abort', stop, { once: true });
      });
    } finally {
      channel.close();
    }
  };

  const countRun = async (name: string): Promise<number> => {
    const runs = (z.number().optional().parse(await ctx.store.global.kv.get('runs:' + name)) ?? 0) + 1;
    await ctx.store.global.kv.set('runs:' + name, runs);
    return runs;
  };

  const waitAndCount = async ({ gate: name }: { gate: string }) => {
    const runs = await countRun(name);
    await waitAt(name);
    return { runs };
  };

  ctx.registerCommand('app.echo', {
    description: 'Returns its text.',
    public: true,
    input: z.object({ text: z.string() }),
    output: z.object({ text: z.string() }),
    handle: (input) => {
      ctx.log.info('app.echo ran.', { length: input.text.length });
      return { text: input.text };
    },
  });
  ctx.registerCommand('app.warn', {
    description: 'Logs a warning, an info line, and a debug line.',
    public: true,
    input: empty,
    output: empty,
    handle: () => {
      ctx.log.warn('app.warn warned.');
      ctx.log.info('app.warn informed.');
      ctx.log.debug('app.warn debugged.');
      return {};
    },
  });
  ctx.registerCommand('app.fail', {
    description: 'Fails.',
    public: true,
    retries: 0,
    input: z.object({ text: z.string() }),
    output: empty,
    handle: () => {
      throw ctx.problem('app/BROKEN');
    },
  });
  ctx.registerQuery('app.answer', { description: 'Answers 42.', public: true, input: empty, output: z.object({ answer: z.number() }), handle: () => ({ answer: 42 }) });
  ctx.registerCommand('app.hidden', { description: 'A private command.', input: empty, output: empty, handle: () => ({}) });
  ctx.registerCommand('app.vault', { description: 'A sync-only command.', public: true, syncOnly: true, input: gate, output: empty, handle: () => ({}) });
  ctx.registerCommand('app.wait', { description: 'Counts a run, then waits at its gate.', public: true, input: gate, output: z.object({ runs: z.number() }), handle: waitAndCount });
  ctx.registerCommand('app.wait-once', { description: 'app.wait without retries.', public: true, retries: 0, input: gate, output: z.object({ runs: z.number() }), handle: waitAndCount });
  ctx.registerQuery('app.runs', {
    description: 'How many times a gate was reached.',
    public: true,
    input: gate,
    output: z.number(),
    handle: async (input) => z.number().optional().parse(await ctx.store.global.kv.get('runs:' + input.gate)) ?? 0,
  });
  ctx.registerQuery('app.waiting', {
    description: 'Whether a job has waited at a gate.',
    public: true,
    input: gate,
    output: z.boolean(),
    handle: async (input) => (await ctx.store.global.kv.get('waiting:' + input.gate)) === true,
  });
  ctx.registerCommand('app.release', {
    description: 'Opens a gate.',
    public: true,
    input: gate,
    output: empty,
    handle: async (input) => {
      await ctx.store.global.kv.set('gate:' + input.gate, true);
      const channel = new BroadcastChannel('app-gate:' + input.gate);
      channel.postMessage('open');
      channel.close();
      return {};
    },
  });
  ctx.registerCommand('app.stream', {
    description: 'Waits at its gate, then sends progress and runs a nested query that sends progress too.',
    public: true,
    input: gate,
    output: z.object({ done: z.boolean() }),
    handle: async (input) => {
      await waitAt(input.gate);
      ctx.job.progress({ step: 'outer' });
      await ctx.exec('app.nested', {});
      return { done: true };
    },
  });
  ctx.registerQuery('app.nested', {
    description: 'Sends one progress chunk.',
    input: empty,
    output: empty,
    handle: () => {
      ctx.job.progress({ step: 'inner' });
      return {};
    },
  });
  ctx.registerHandler('kernel.job.cancelled', {
    description: 'Records a cancelled job.',
    handle: async (input) => {
      await cancelled().insert({ jobId: input.jobId, name: input.name, reason: input.reason });
    },
  });
  ctx.registerQuery('app.cancelled', {
    description: 'The recorded cancelled jobs.',
    public: true,
    input: empty,
    output: z.array(cancelledSchema),
    handle: async () => (await cancelled().find({}, { limit: 100 })).map(({ jobId, name, reason }) => ({ jobId, name, reason })),
  });
  ctx.registerHandler('kernel.stopping', {
    description: 'Waits at the stopping gate once app.hold-stopping asked for it.',
    handle: async () => {
      if ((await ctx.store.global.kv.get('hold-stopping')) !== true) return;
      ctx.log.info('app holds the stop.');
      await waitAt('stopping');
    },
  });
  ctx.registerCommand('app.hold-stopping', {
    description: 'Makes the kernel.stopping handler wait.',
    public: true,
    input: empty,
    output: empty,
    handle: async () => {
      await ctx.store.global.kv.set('hold-stopping', true);
      return {};
    },
  });
  ctx.registerCommand('app.sleeper', {
    description: 'Starts a long-lived process.',
    public: true,
    input: empty,
    output: z.object({ pid: z.number() }),
    handle: async () => {
      const started = await ctx.processes.start('sleeper', { command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] });
      return { pid: started.pid };
    },
  });
};
`;
