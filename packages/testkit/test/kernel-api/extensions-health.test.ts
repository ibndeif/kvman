import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const described = {
  name: '@test/e',
  namespace: 'e',
  entry: entry(`
  ctx.registerCommand('e.do', { description: 'Does it.', input: z.object({ text: z.string() }), output: z.object({ ok: z.boolean() }), public: true, handle: () => ({ ok: true }) });
  ctx.registerQuery('e.peek', { description: 'Peeks.', input: z.object({}), output: z.string(), handle: () => 'x' });
  ctx.registerCommand('e.transformed', { description: 'Counts letters.', input: z.object({}), output: z.string().transform((text) => text.length), handle: () => 'abc' });
  ctx.registerCommand('e.dated', { description: 'Takes a date.', input: z.object({ at: z.date() }), output: z.object({}), handle: () => ({}) });
  ctx.registerSetting('e.level', { description: 'A level.', schema: z.number(), default: 1, scopes: ['global'] });
  ctx.registerHandler('kernel.job.failed', { description: 'Watches failures.', handle: () => undefined });`),
};

const schemaUri = 'https://json-schema.org/draft/2020-12/schema';

describe('kernel.extensions.list and kernel.health.get (02 §2.12)', () => {
  it('M1.6-H6 the run\'s extensions are listed with what they register, and health describes the run', async () => {
    const kernel = await harness.start([described]);
    const [extension, ...others] = await kernel.exec('kernel.extensions.list', {});
    expect(others).toEqual([]);
    expect(extension).toMatchObject({
      name: '@test/e',
      version: '0.1.0',
      source: `path:${harness.folder('@test/e')}`,
      revision: 0,
      namespace: 'e',
      queries: [{ name: 'e.peek', description: 'Peeks.', public: false, input: { type: 'object' }, output: { type: 'string' } }],
      settings: [{ key: 'e.level', description: 'A level.', scopes: ['global'] }],
      handlers: [{ point: 'kernel.job.failed', description: 'Watches failures.' }],
    });
    expect(extension?.commands.map((command) => [command.name, command.public])).toEqual([['e.do', true], ['e.transformed', false], ['e.dated', false]]);
    expect(extension?.commands[0]).toMatchObject({ input: { type: 'object', properties: { text: { type: 'string' } } }, output: { properties: { ok: { type: 'boolean' } } } });
    expect(await kernel.exec('kernel.health.get', {})).toEqual({ version: '0.1.0', preset: 'test', mode: 'web', workers: 1, uptimeMs: 0, languages: ['ar', 'en'] });
  });

  it('M1.6-E16 parts JSON Schema cannot express are {}', async () => {
    const kernel = await harness.start([described]);
    const [extension] = await kernel.exec('kernel.extensions.list', {});
    const command = (name: string) => extension?.commands.find((entry) => entry.name === name);
    expect(command('e.transformed')?.output).toEqual({ $schema: schemaUri });
    expect(command('e.dated')?.input).toMatchObject({ properties: { at: {} } });
  });

  it('M1.6-E17 an extension may not claim the namespace kernel', async () => {
    await expect(harness.start([{ ...described, name: '@test/k', namespace: 'kernel', entry: entry('') }])).rejects.toMatchObject({
      problem: { code: 'EXTENSION_INVALID', message: expect.stringContaining('both claim the namespace "kernel"') },
    });
  });

  it('M1.6-E18 uptimeMs follows the kernel\'s clock', async () => {
    const kernel = await harness.start([described]);
    const before = await kernel.exec('kernel.health.get', {});
    await kernel.clock.advance(5000);
    const after = await kernel.exec('kernel.health.get', {});
    expect(after.uptimeMs - before.uptimeMs).toBe(5000);
  });

  it('QA18-H25 kernel.registrations.list answers one row per command and query, private ones too, with its owner and no schema', async () => {
    const kernel = await harness.start([described]);
    expect(await kernel.exec('kernel.registrations.list', {})).toEqual([
      { name: 'e.do', kind: 'command', extension: '@test/e', public: true, description: 'Does it.' },
      { name: 'e.peek', kind: 'query', extension: '@test/e', public: false, description: 'Peeks.' },
      { name: 'e.transformed', kind: 'command', extension: '@test/e', public: false, description: 'Counts letters.' },
      { name: 'e.dated', kind: 'command', extension: '@test/e', public: false, description: 'Takes a date.' },
    ]);
    expect(await kernel.exec('kernel.registrations.list', {}, { as: '@test/e' })).toHaveLength(4);
  });
});
