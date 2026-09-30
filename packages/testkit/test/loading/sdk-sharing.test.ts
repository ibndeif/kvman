import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const throwing = (name: string, error: string) =>
  `ctx.registerQuery('${name}', { description: 'Fails.', input: z.object({}), output: z.object({}), public: true, handle: (): never => { throw ${error}; } });`;

describe('the shared sdk (02 §2.9)', () => {
  it('M1.4-H2 two extensions share the kernel sdk, and load from their .ts source', async () => {
    const kernel = await harness.start([
      { name: '@test/a', namespace: 'a', entry: entry(throwing('a.fail', "ctx.problem('a/BROKEN', { part: 'wheel' })")) },
      { name: '@test/b', namespace: 'b', entry: entry(throwing('b.fail', "new ProblemError({ code: 'b/OWN', message: 'Its own ProblemError.' })")) },
    ]);
    await expect(kernel.exec('a.fail', {})).rejects.toMatchObject({ problem: { code: 'a/BROKEN', params: { part: 'wheel' } } });
    await expect(kernel.exec('b.fail', {})).rejects.toMatchObject({ problem: { code: 'b/OWN', message: 'Its own ProblemError.' } });
  });
});
