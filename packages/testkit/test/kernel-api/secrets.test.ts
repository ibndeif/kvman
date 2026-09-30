import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const value = 's3cret-value-m16';
const keeper = {
  name: '@test/k',
  namespace: 'k',
  entry: entry(`
  ctx.registerQuery('k.token-get', { description: 'Reads the token.', input: z.object({}), output: z.unknown(), public: true,
    handle: async () => (await ctx.secrets.get('token')) ?? null });
  ctx.registerCommand('k.schedule-secret', { description: 'Schedules a secret.', input: z.object({}), output: z.string(), public: true,
    handle: () => ctx.schedule('kernel.secrets.set', { extension: '@test/k', name: 'x', value: 'v' }, { at: new Date(Date.now() + 60_000) }) });`),
};

const problem = (code: string) => ({ problem: { code } });

describe('secrets (02 §2.8, §2.12)', () => {
  it('M1.6-H4 kernel.secrets.list never returns a value, and kernel.secrets.set runs only as a sync call', async () => {
    const kernel = await harness.start([keeper]);
    await kernel.exec('kernel.secrets.set', { extension: '@test/k', name: 'token', value });
    expect(await kernel.exec('k.token-get', {})).toBe(value);
    expect(await kernel.exec('kernel.secrets.list', {})).toEqual([{ extension: '@test/k', name: 'token' }]);
    await expect(kernel.execAsync('kernel.secrets.set', { extension: '@test/k', name: 'token', value })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await expect(kernel.exec('k.schedule-secret', {})).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await kernel.exec('kernel.secrets.delete', { extension: '@test/k', name: 'token' });
    expect(await kernel.exec('k.token-get', {})).toBeNull();
    expect(JSON.stringify(await kernel.exec('kernel.jobs.list', { limit: 1000 }))).not.toContain(value);
    expect(readFileSync(path.join(kernel.home, 'logs', 'kvman.log'), 'utf8')).not.toContain(value);
  });

  it('M1.6-E8 an extension that is not in the run is NOT_FOUND', async () => {
    const kernel = await harness.start([keeper]);
    await expect(kernel.exec('kernel.secrets.set', { extension: '@test/nobody', name: 'token', value })).rejects.toMatchObject(problem('NOT_FOUND'));
    await expect(kernel.exec('kernel.secrets.delete', { extension: '@test/nobody', name: 'token' })).rejects.toMatchObject(problem('NOT_FOUND'));
  });

  it('M1.6-E9 deleting a secret that is not set changes nothing', async () => {
    const kernel = await harness.start([keeper], { secrets: { '@test/k': { token: value } } });
    expect(await kernel.exec('kernel.secrets.delete', { extension: '@test/k', name: 'missing' })).toEqual({});
    expect(await kernel.exec('kernel.secrets.list', {})).toEqual([{ extension: '@test/k', name: 'token' }]);
  });
});
