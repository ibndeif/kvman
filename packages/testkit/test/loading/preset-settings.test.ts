import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const notes = {
  name: '@test/notes',
  namespace: 'notes',
  entry: entry(`
    ctx.registerSetting('notes.home', { description: 'The home page.', schema: z.string(), scopes: [] });
    ctx.registerSetting('notes.greeting', { description: 'The greeting.', schema: z.string(), default: 'Hello' });
    ctx.registerQuery('notes.settings-get', { description: 'Gets the settings.', input: z.object({}), output: z.object({ home: z.string(), greeting: z.string() }), public: true,
      handle: async () => ({ home: z.string().parse(await ctx.settings.get('notes.home')), greeting: z.string().parse(await ctx.settings.get('notes.greeting')) }) });
  `),
};

describe("the preset's settings (02 §2.8)", () => {
  it('M1.4-H3 an unknown key, an invalid value, or a missing required key fails; valid settings resolve', async () => {
    const fails = (settings: Record<string, string | number>, message: RegExp) =>
      expect(harness.start([notes], { settings })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', message: expect.stringMatching(message) } });
    await fails({ 'notes.home': 'notes.page', 'notes.colour': 'red' }, /"notes\.colour", which no extension registers/);
    await fails({ 'notes.home': 'notes.page', 'notes.greeting': 42 }, /The preset's value of "notes\.greeting" is invalid/);
    await fails({}, /"notes\.home" has no default, so the preset must set it/);
    const kernel = await harness.start([notes], { settings: { 'notes.home': 'notes.page' } });
    expect(await kernel.exec('notes.settings-get', {})).toEqual({ home: 'notes.page', greeting: 'Hello' });
  });
});
