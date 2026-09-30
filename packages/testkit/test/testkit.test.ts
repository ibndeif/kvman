import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { createTestKernel } from '../src/index.ts';
import { entry, useHarness } from './extension-folders.ts';

const harness = useHarness();

const probe = {
  name: '@test/probe',
  namespace: 'probe',
  entry: `import { threadId } from 'node:worker_threads';\n${entry(`
    const empty = { input: z.object({}), public: true };
    ctx.registerQuery('probe.job-get', { description: 'Describes its job.', ...empty, output: z.unknown(),
      handle: async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return { caller: ctx.job.caller, path: ctx.job.workspace.path, thread: threadId }; } });
    ctx.registerQuery('probe.secret-get', { description: 'Reads a secret.', input: z.object({ name: z.string() }), output: z.string().optional(), public: true,
      handle: (input) => ctx.secrets.get(input.name) });
    ctx.registerCommand('probe.secret-set', { description: 'Sets a secret.', input: z.object({ name: z.string(), value: z.string() }), output: z.object({}), public: true,
      handle: async (input) => { await ctx.secrets.set(input.name, input.value); return {}; } });
  `)}`,
};

describe('createTestKernel (10)', () => {
  it('M1.4-E23 exec runs as an extension with as, and an unknown workspace is not found', async () => {
    const kernel = await harness.start([probe]);
    expect(await kernel.exec('probe.job-get', {}, { as: '@test/caller' })).toMatchObject({ caller: { kind: 'extension', name: '@test/caller' } });
    await expect(kernel.exec('probe.job-get', {}, { workspaceId: 'missing' })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
  });

  it('M1.4-E24 Home is a temporary folder, one worker runs, and close removes the folders', async () => {
    const kernel = await harness.start([probe]);
    const answer = z.object({ path: z.string(), thread: z.number() });
    const answers = await Promise.all(Array.from({ length: 8 }, async () => answer.parse(await kernel.exec('probe.job-get', {}))));
    expect(answers[0]).toMatchObject({ path: kernel.homeFolder });
    expect(kernel.homeFolder).not.toBe(homedir());
    expect(new Set(answers.map((found) => found.thread)).size).toBe(1);
    const own = await createTestKernel({ extensions: [] });
    await own.close();
    expect(existsSync(own.home)).toBe(false);
    expect(existsSync(own.homeFolder)).toBe(false);
  });

  it('M1.4-E25 given secrets reach handlers, and a secret set in one job is read in the next', async () => {
    const kernel = await harness.start([probe], { secrets: { '@test/probe': { token: 'given' } } });
    expect(await kernel.exec('probe.secret-get', { name: 'token' })).toBe('given');
    await kernel.exec('probe.secret-set', { name: 'other', value: 'set' });
    expect(await kernel.exec('probe.secret-get', { name: 'other' })).toBe('set');
  });
});
