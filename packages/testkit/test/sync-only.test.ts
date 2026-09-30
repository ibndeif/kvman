import { describe, expect, it } from 'vitest';
import { entry, useHarness } from './extension-folders.ts';

const harness = useHarness();

const vault = {
  name: '@test/vault',
  namespace: 'vault',
  entry: entry(`
  const empty = { input: z.object({}), output: z.unknown(), public: true };
  ctx.registerCommand('vault.put', { description: 'Keeps a value.', input: z.object({ value: z.string() }), output: z.object({}), public: true, syncOnly: true,
    handle: async (input) => { await ctx.secrets.set('value', input.value); return {}; } });
  ctx.registerCommand('vault.queue', { description: 'Queues the put.', ...empty, handle: () => ctx.execAsync('vault.put', { value: 'queued' }) });
  ctx.registerCommand('vault.later', { description: 'Schedules the put.', ...empty,
    handle: () => ctx.schedule('vault.put', { value: 'later' }, { at: new Date(Date.now() + 60_000) }) });`),
};

const problem = (code: string) => ({ problem: { code } });

describe('sync-only commands (03 §3.1, ADR 0009, 80)', () => {
  it('M2.2-E19 a syncOnly command runs sync, and queueing or scheduling it fails with no job row', async () => {
    const kernel = await harness.start([vault]);
    await expect(kernel.exec('vault.put', { value: 'direct' })).resolves.toEqual({});
    await expect(kernel.execAsync('vault.put', { value: 'async' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await expect(kernel.exec('vault.queue', {})).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await expect(kernel.exec('vault.later', {})).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    const rows = JSON.stringify(await kernel.exec('kernel.jobs.list', { limit: 1000 }));
    expect(rows).not.toContain('vault.put');
  });
});
