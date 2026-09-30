import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const empty = "input: z.object({}), output: z.unknown()";
const access = {
  name: '@test/access',
  namespace: 'access',
  entry: entry(`
    ctx.registerCommand('access.private-do', { description: 'Is private.', ${empty}, handle: () => 'done' });
    ctx.registerCommand('access.private-call', { description: 'Calls its own private command.', ${empty}, public: true, handle: () => ctx.exec('access.private-do', {}) });
    ctx.registerQuery('access.command-run', { description: 'Runs a command from a query.', ${empty}, public: true, handle: () => ctx.exec('access.private-do', {}) });
    ctx.registerQuery('access.store-write', { description: 'Writes from a query.', ${empty}, public: true, handle: () => ctx.store.kv.set('key', 1) });
    ctx.registerQuery('access.secret-write', { description: 'Sets a secret from a query.', ${empty}, public: true, handle: () => ctx.secrets.set('key', 'value') });
    ctx.registerCommand('access.recurse', { description: 'Calls itself.', input: z.object({ depth: z.number() }), output: z.number(), public: true,
      handle: async (input) => (input.depth >= 20 ? input.depth : z.number().parse(await ctx.exec('access.recurse', { depth: input.depth + 1 }))) });
  `),
};
const other = {
  name: '@test/other',
  namespace: 'other',
  entry: entry(`ctx.registerCommand('other.call', { description: 'Calls a private command of another extension.', ${empty}, public: true, handle: () => ctx.exec('access.private-do', {}) });`),
};

describe('access rules (02 §2.1, §2.9, §2.13)', () => {
  it('M1.4-H5 each access, read-only, and depth rule fails with its code', async () => {
    const kernel = await harness.start([access, other]);
    await expect(kernel.exec('access.private-do', {})).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
    await expect(kernel.exec('access.command-run', {})).rejects.toMatchObject({ problem: { code: 'READ_ONLY' } });
    await expect(kernel.exec('access.recurse', { depth: 1 })).rejects.toMatchObject({ problem: { code: 'TOO_DEEP', params: { limit: 16 } } });
  });

  it('M1.4-E13 an unknown name is not found', async () => {
    const kernel = await harness.start([access]);
    await expect(kernel.exec('access.missing', {})).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
  });

  it('M1.4-E14 a private command answers only its own extension', async () => {
    const kernel = await harness.start([access, other]);
    await expect(kernel.exec('access.private-do', {})).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
    await expect(kernel.exec('access.private-do', {}, { as: '@test/other' })).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
    await expect(kernel.exec('other.call', {})).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
    expect(await kernel.exec('access.private-call', {})).toBe('done');
    expect(await kernel.exec('access.private-do', {}, { as: '@test/access' })).toBe('done');
  });

  it('M1.4-E15 a query can neither run a command nor write', async () => {
    const kernel = await harness.start([access]);
    for (const name of ['access.command-run', 'access.store-write', 'access.secret-write']) {
      await expect(kernel.exec(name, {}), name).rejects.toMatchObject({ problem: { code: 'READ_ONLY' } });
    }
  });

  it('M1.4-E16 the 17th nested sync call fails TOO_DEEP', async () => {
    const kernel = await harness.start([access]);
    await expect(kernel.exec('access.recurse', { depth: 5 })).resolves.toBe(20);
    await expect(kernel.exec('access.recurse', { depth: 4 })).rejects.toMatchObject({ problem: { code: 'TOO_DEEP', params: { limit: 16 } } });
  });
});
