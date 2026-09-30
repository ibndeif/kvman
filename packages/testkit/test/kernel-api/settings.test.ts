import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const owner = {
  name: '@test/s',
  namespace: 's',
  entry: entry(`
  ctx.registerSetting('s.color', { description: 'A color.', schema: z.string(), default: 'blue' });
  ctx.registerSetting('s.global-only', { description: 'A global number.', schema: z.number(), default: 1, scopes: ['global'] });
  ctx.registerSetting('s.custom', { description: 'A custom value.', schema: z.custom((value) => typeof value === 'string'), default: 'x' });
  ctx.registerCommand('s.set', { description: 'Sets a key.', input: z.object({ key: z.string(), value: z.unknown(), scope: z.enum(['global', 'workspace']) }),
    output: z.object({}), public: true, handle: async (input) => { await ctx.settings.set(input.key, input.value, { scope: input.scope }); return {}; } });
  ctx.registerQuery('s.color-get', { description: 'Reads the color.', input: z.object({}), output: z.unknown(), public: true, handle: () => ctx.settings.get('s.color') });
  ctx.registerQuery('s.set-in-query', { description: 'Writes from a query.', input: z.object({}), output: z.object({}), public: true,
    handle: async () => { await ctx.settings.set('s.color', 'x', { scope: 'global' }); return {}; } });`),
};
const other = {
  name: '@test/t',
  namespace: 't',
  entry: entry(`ctx.registerSetting('t.size', { description: 'A size.', schema: z.number(), default: 3 });`),
};

const problem = (code: string) => ({ problem: { code } });

async function start() {
  const kernel = await harness.start([owner, other], { settings: { 's.color': 'green' } });
  const workspace = await kernel.exec('kernel.workspace.open', { path: harness.temporaryFolder() });
  const listed = async (key: string, workspaceId = 'home') => (await kernel.exec('kernel.settings.list', {}, { workspaceId })).find((setting) => setting.key === key);
  return { kernel, workspace, listed };
}

describe('settings (02 §2.8, §2.12)', () => {
  it('M1.6-H3 kernel.settings.* sets, resets, and lists values with their source, scopes, and JSON Schema', async () => {
    const { kernel, workspace, listed } = await start();
    expect(await listed('s.color')).toEqual({
      key: 's.color',
      description: 'A color.',
      schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string' },
      scopes: ['global', 'workspace'],
      value: 'green',
      source: 'preset',
    });
    await kernel.exec('kernel.settings.set', { key: 's.color', value: 'red', scope: 'global' });
    await kernel.exec('kernel.settings.set', { key: 's.color', value: 'violet', scope: 'workspace' }, { workspaceId: workspace.id });
    expect(await listed('s.color', workspace.id)).toMatchObject({ value: 'violet', source: 'workspace' });
    expect(await listed('s.color')).toMatchObject({ value: 'red', source: 'global' });
    await kernel.exec('kernel.settings.reset', { key: 's.color', scope: 'workspace' }, { workspaceId: workspace.id });
    expect(await listed('s.color', workspace.id)).toMatchObject({ value: 'red', source: 'global' });
    expect(await listed('kernel.language')).toMatchObject({ value: 'en', source: 'default', scopes: ['global'] });
  });

  it('M1.6-E4 ctx.settings.set writes its own key in each scope', async () => {
    const { kernel, workspace } = await start();
    await kernel.exec('s.set', { key: 's.color', value: 'teal', scope: 'workspace' }, { workspaceId: workspace.id });
    expect(await kernel.exec('s.color-get', {}, { workspaceId: workspace.id })).toBe('teal');
    expect(await kernel.exec('s.color-get', {})).toBe('green');
    await kernel.exec('s.set', { key: 's.color', value: 'gold', scope: 'global' });
    expect(await kernel.exec('s.color-get', {})).toBe('gold');
  });

  it('M1.6-E5 ctx.settings.set of another key, an unknown key, from a query, in a missing scope, or off its schema fails', async () => {
    const { kernel } = await start();
    await expect(kernel.exec('s.set', { key: 't.size', value: 4, scope: 'global' })).rejects.toMatchObject(problem('NOT_PUBLIC'));
    await expect(kernel.exec('s.set', { key: 's.nothing', value: 4, scope: 'global' })).rejects.toMatchObject(problem('NOT_FOUND'));
    await expect(kernel.exec('s.set-in-query', {})).rejects.toMatchObject(problem('READ_ONLY'));
    await expect(kernel.exec('s.set', { key: 's.global-only', value: 2, scope: 'workspace' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await expect(kernel.exec('s.set', { key: 's.color', value: 5, scope: 'global' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
  });

  it('M1.6-E6 the user sets any extension\'s key, but a kernel key only globally', async () => {
    const { kernel, listed } = await start();
    await kernel.exec('kernel.settings.set', { key: 't.size', value: 9, scope: 'global' });
    expect(await listed('t.size')).toMatchObject({ value: 9, source: 'global' });
    await expect(kernel.exec('kernel.settings.set', { key: 'kernel.jobs.retentionDays', value: 1, scope: 'workspace' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
  });

  it('M1.6-E7 a schema JSON Schema cannot express is listed as {}', async () => {
    const { listed } = await start();
    expect((await listed('s.custom'))?.schema).toEqual({ $schema: 'https://json-schema.org/draft/2020-12/schema' });
  });
});
