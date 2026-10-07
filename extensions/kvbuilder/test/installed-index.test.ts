import { extensionInfoSchema, z } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { installedIndex } from '../src/build/installed-index.ts';
import { guideListSchema } from '../src/docs/guides.ts';
import { useKvbuilder } from './support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();
type Extension = z.output<typeof extensionInfoSchema>;
const preset = { name: 'coder', origin: 'bundled' as const, extensions: {} };
const lastLine = 'This is what ran when /build-kvman was typed. `kvman extensions-list` and `docs list` are current.';

function extension(name: string, overrides: Partial<Extension> = {}): Extension {
  return {
    name, namespace: name, source: 'bundled', version: '0.1.0', revision: 0,
    commands: [], queries: [], settings: [], handlers: [], ...overrides,
  };
}

const registration = (name: string, publicAccess: boolean) => ({ name, description: 'A test registration.', public: publicAccess, input: {}, output: {} });

describe('the /build-kvman installed index (ADR 0030, 7)', { timeout: 60_000 }, () => {
  it('QA42-H16 it lists the running extensions, sorted keys and public jobs, and their docs pages', async () => {
    const { kernel } = await kvbuilder.start();
    const running = (await kernel.exec('kernel.extensions.list', {})).map((row) => ({ ...row, source: 'bundled' as const }));
    const guides = guideListSchema.parse(await kernel.exec('kvbuilder.guides.list', {}));
    const todo = extension('todo', {
      settings: [{ key: 'todo.zebra', description: 'Zebra', scopes: [] }, { key: 'todo.alpha', description: 'Alpha', scopes: [] }],
      commands: [registration('todo.z.add', true), registration('todo.hidden.run', false), registration('todo.a.add', true)],
      queries: [registration('todo.z.list', true), registration('todo.hidden.get', false), registration('todo.a.get', true)],
    });
    const text = installedIndex(preset, [todo, ...running.toReversed()], guides);
    expect(text.startsWith('Preset: coder (bundled)\n')).toBe(true);
    expect([...text.matchAll(/^- (\S+) \(/gm)].map((match) => match[1])).toEqual([...running.map((row) => row.name), 'todo'].sort((left, right) => left.localeCompare(right)));
    const webui = running.find((row) => row.namespace === 'kvwebui');
    const webuiStart = text.indexOf('- @kvman/kvwebui (');
    const webuiBlock = text.slice(webuiStart, text.indexOf('\n- ', webuiStart));
    expect(text).toContain(`- @kvman/kvwebui (kvwebui), bundled, ${webui?.version}`);
    expect(webuiBlock).toContain(`  settings: ${webui?.settings.map((setting) => setting.key).sort().join(', ')}`);
    expect(webuiBlock).toContain('  public queries: kvwebui.docs.get, kvwebui.docs.list');
    expect(webuiBlock).toContain('  pages: components (Custom components (Vue)), views (Pages and views (kvwebui))');
    expect(text).toContain('- todo (todo), bundled, 0.1.0\n  settings: todo.alpha, todo.zebra\n  public commands: todo.a.add, todo.z.add\n  public queries: todo.a.get, todo.z.list\n  pages: none');
    expect(text).not.toContain('todo.hidden');
    expect(text.endsWith(lastLine)).toBe(true);
    expect(text).not.toContain('conventions (');
  });

  it('QA42-E18 failed docs give that extension pages: none without losing other blocks', () => {
    const guides = { pages: [{ extension: 'good', topic: 'usage', title: 'Usage' }, { extension: 'kvman', topic: 'conventions', title: 'Conventions' }], problems: [{ extension: 'bad', problem: { code: 'HANDLER_FAILED', message: 'Docs failed.' } }] };
    expect(installedIndex(preset, [extension('good'), extension('bad')], guides)).toBe([
      'Preset: coder (bundled)', '- bad (bad), bundled, 0.1.0', '  pages: none', '- good (good), bundled, 0.1.0',
      '  pages: usage (Usage)', lastLine,
    ].join('\n'));
  });

  it('QA42-E19 an oversized index removes whole blocks and counts each omitted extension in the UTF-8 cap', () => {
    const extensions = Array.from({ length: 80 }, (_, index) => extension(`extension-${String(index).padStart(3, '0')}`, {
      settings: [{ key: `extension.${'é'.repeat(150)}`, description: 'Long setting', scopes: [] }],
    }));
    const text = installedIndex(preset, extensions, { pages: [], problems: [] });
    const names = [...text.matchAll(/^- (extension-\d+) \(/gm)].map((match) => match[1]);
    const omitted = extensions.length - names.length;
    expect(omitted).toBeGreaterThan(0);
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(16 * 1024);
    expect(names).toEqual(extensions.slice(0, names.length).map((row) => row.name));
    expect(text.endsWith(`${lastLine} ${String(omitted)} more extensions aren't listed here.`)).toBe(true);
    expect((text.match(/  pages: none/g) ?? [])).toHaveLength(names.length);
    expect(Buffer.byteLength(text.replace(`${lastLine} ${String(omitted)} more extensions aren't listed here.`, `- ${extensions[names.length]?.name} (${extensions[names.length]?.namespace}), bundled, 0.1.0\n  settings: ${extensions[names.length]?.settings[0]?.key}\n  pages: none\n${lastLine} ${String(omitted - 1)} more extensions aren't listed here.`), 'utf8')).toBeGreaterThan(16 * 1024);
  });

  it('QA42-E20 empty optional lines are omitted while pages: none stays', () => {
    expect(installedIndex(preset, [extension('plain')], { pages: [], problems: [] })).toBe(`Preset: coder (bundled)\n- plain (plain), bundled, 0.1.0\n  pages: none\n${lastLine}`);
  });
});
