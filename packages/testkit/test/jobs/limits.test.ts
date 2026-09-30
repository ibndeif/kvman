import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const sizes = {
  name: '@test/sizes',
  namespace: 'sizes',
  entry: entry(`
    ctx.registerCommand('sizes.repeat', { description: 'Repeats a text.', input: z.object({ text: z.string(), times: z.number().int() }), output: z.object({ text: z.string() }),
      public: true, maxInputBytes: 100, maxOutputBytes: 100, handle: (input) => ({ text: input.text.repeat(input.times) }) });
    ctx.registerQuery('sizes.wrong-get', { description: 'Returns the wrong shape.', input: z.object({}), output: z.object({ text: z.string() }), public: true,
      handle: () => ({ text: 42 }) as never });
  `),
};

describe('size caps and validation (02 §2.1, §2.13)', () => {
  it('M1.4-E17 an input or output over its cap fails TOO_LARGE with the limit', async () => {
    const kernel = await harness.start([sizes]);
    expect(await kernel.exec('sizes.repeat', { text: 'ab', times: 3 })).toEqual({ text: 'ababab' });
    await expect(kernel.exec('sizes.repeat', { text: 'x'.repeat(100), times: 1 })).rejects.toMatchObject({ problem: { code: 'TOO_LARGE', params: { limit: 100 } } });
    await expect(kernel.exec('sizes.repeat', { text: 'x', times: 100 })).rejects.toMatchObject({ problem: { code: 'TOO_LARGE', params: { limit: 100 } } });
  });

  it('M1.4-E18 an input or output that does not fit its schema fails VALIDATION_FAILED', async () => {
    const kernel = await harness.start([sizes]);
    await expect(kernel.exec('sizes.repeat', { text: 'ab' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', params: { issues: [{ path: 'times' }] } } });
    await expect(kernel.exec('sizes.wrong-get', {})).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', message: expect.stringMatching(/output/) } });
  });
});
