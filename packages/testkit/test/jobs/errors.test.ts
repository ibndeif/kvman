import { describe, expect, it, vi } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const errors = {
  name: '@test/errors',
  namespace: 'errors',
  entry: entry(`
    const empty = { input: z.object({}), output: z.unknown(), public: true };
    ctx.registerCommand('errors.throw', { description: 'Throws a plain error.', ...empty, handle: () => { throw new Error('the handler broke on row 7'); } });
    ctx.registerCommand('errors.problem', { description: 'Throws a Problem.', ...empty, handle: () => { throw ctx.problem('errors/EMPTY', { field: 'text' }); } });
    ctx.registerCommand('errors.slow', { description: 'Outlives its timeout.', ...empty, timeoutMs: 50,
      handle: async () => {
        await new Promise((resolve) => ctx.job.signal.addEventListener('abort', resolve));
        await ctx.store.kv.set('aborted', true);
      } });
    ctx.registerQuery('errors.aborted-get', { description: 'Tells whether the slow command saw its abort.', ...empty, handle: async () => (await ctx.store.kv.get('aborted')) ?? false });
  `),
};

describe('handler failures (02 §2.3)', () => {
  it('M1.4-E19 a plain error is HANDLER_FAILED with its message only in the log; a Problem keeps its code and params', async () => {
    const kernel = await harness.start([errors]);
    const failure = kernel.exec('errors.throw', {});
    await expect(failure).rejects.toMatchObject({ problem: { code: 'HANDLER_FAILED' } });
    await expect(failure).rejects.not.toMatchObject({ problem: { message: expect.stringMatching(/row 7/) } });
    expect(harness.logLines(kernel).some((line) => line['error'] === 'the handler broke on row 7' && typeof line['stack'] === 'string')).toBe(true);
    await expect(kernel.exec('errors.problem', {})).rejects.toMatchObject({ problem: { code: 'errors/EMPTY', params: { field: 'text' } } });
  });

  it('M1.4-E20 a handler past its timeoutMs fails TIMEOUT, and its signal is aborted', async () => {
    const kernel = await harness.start([errors]);
    await expect(kernel.exec('errors.slow', {})).rejects.toMatchObject({ problem: { code: 'TIMEOUT', params: { limit: 50 } } });
    await vi.waitFor(async () => expect(await kernel.exec('errors.aborted-get', {})).toBe(true));
  });
});
