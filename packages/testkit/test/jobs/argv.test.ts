import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const argv = {
  name: '@test/argv',
  namespace: 'argv',
  entry: entry(`
  ctx.registerQuery('argv.get', { description: 'Gives the worker process.argv.', input: z.object({}), output: z.array(z.string()), public: true, handle: () => process.argv });`),
};

describe('workers see the main thread argv (02 §2.2)', () => {
  it("M2.5-E37 a handler's process.argv equals the main thread's", async () => {
    const kernel = await harness.start([argv]);
    expect(await kernel.exec('argv.get', {})).toEqual(process.argv);
  });
});
