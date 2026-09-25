import { z, type Ext } from '@kvman/sdk';
import { codeOfCall, firstRun } from './notes-state.ts';

const empty = z.object({});

export function registerLive(ext: Ext): void {
  ext.registerCommand('notes.stream', {
    description: 'Streams, then ends its worker on its first attempt.', input: empty,
    handle: async (_input, ctx) => {
      ctx.live('notes.text.streamed', 'a', { text: 'one' });
      ctx.live('notes.text.streamed', 'a', { text: 'two' });
      ctx.live('notes.text.streamed', 'b', { text: 'three' });
      if (await firstRun(ctx, 'crash')) process.exit(1);
      ctx.live('notes.text.streamed', 'a', { text: 'again' });
      return {};
    },
  });
  ext.registerCommand('notes.live.publish', {
    description: 'Publishes its live event as an event.', input: empty,
    handle: async (_input, ctx) => {
      ctx.publish('notes.text.streamed', { text: 'x' });
      return {};
    },
  });
  ext.registerCommand('notes.live.checks', {
    description: 'Streams wrong chunks, then a right one.', input: empty,
    handle: async (_input, ctx) => {
      const codes = [
        await codeOfCall(() => ctx.live('notes.added', 'k', { text: 'x' })),
        await codeOfCall(() => ctx.live('notes.text.streamed', 'k', { value: 0.5 })),
        await codeOfCall(() => ctx.live('notes.text.streamed', 'k', { reset: true })),
      ];
      ctx.live('notes.text.streamed', 'k', { text: 'fine' });
      return { codes };
    },
  });
  ext.registerCommand('notes.live.foreign', {
    description: 'Streams another extension\'s live event.', input: empty,
    handle: async (_input, ctx) => ({ code: await codeOfCall(() => ctx.live('counter.progress.updated', 'k', { value: 0.5 })) }),
  });
}
