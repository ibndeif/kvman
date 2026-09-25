import { z, type Ext } from '@kvman/sdk';

// Handlers the adapter and lifecycle tests drive over HTTP and the event stream.
export function registerAdapters(ext: Ext): void {
  ext.registerCommand('notes.relay', {
    description: 'Asks a question through ctx.command and returns its answer.', input: z.object({ id: z.string() }),
    handle: async ({ id }, ctx) => ctx.command('notes.ask', { id }),
  });
  ext.registerCommand('notes.nap', {
    description: 'Runs for a while of real time.', input: z.object({ ms: z.number() }),
    handle: async ({ ms }) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { slept: ms };
    },
  });
  ext.registerCommand('notes.chunks', {
    description: 'Streams each text as a live chunk.', input: z.object({ key: z.string(), texts: z.array(z.string()) }),
    handle: async ({ key, texts }, ctx) => {
      for (const text of texts) ctx.live('notes.text.streamed', key, { text });
      return {};
    },
  });
  ext.registerCommand('notes.shutdown.try', {
    description: 'Tries to shut the kernel down and returns the problem code.', input: z.object({}),
    handle: async (_input, ctx) => {
      try {
        return { result: await ctx.command('kernel.shutdown', {}) };
      } catch (error) {
        return { code: error instanceof Error && 'problem' in error && typeof error.problem === 'object' && error.problem !== null && 'code' in error.problem ? error.problem.code : 'not-a-problem' };
      }
    },
  });
}
