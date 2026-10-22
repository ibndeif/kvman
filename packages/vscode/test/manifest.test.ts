import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const read = (file: string): unknown => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const manifestSchema = z.object({
  name: z.string(),
  publisher: z.string(),
  engines: z.object({ vscode: z.string() }),
  extensionKind: z.array(z.string()),
  main: z.string(),
  contributes: z.object({
    viewsContainers: z.object({ activitybar: z.array(z.object({ id: z.string(), title: z.string(), icon: z.string() })) }),
    views: z.record(z.string(), z.array(z.object({ type: z.string(), id: z.string(), name: z.string() }))),
    commands: z.array(z.object({ command: z.string(), icon: z.string().optional() })),
    menus: z.record(z.string(), z.array(z.object({ command: z.string(), when: z.string() }))),
    configuration: z.object({ properties: z.record(z.string(), z.object({ type: z.string(), default: z.unknown(), scope: z.string() })) }),
  }),
});

describe("the extension's manifest (15 §15.1 and §15.2, ADR 0099, 10 and 14)", () => {
  it('M4.2-E9 M4.6-H1 the manifest contributes what plan 15 lists, under the VS Code identity ibndeif.kvman', () => {
    const manifest = manifestSchema.parse(read('manifest.json'));
    expect([manifest.name, manifest.publisher, manifest.engines.vscode, manifest.extensionKind, manifest.main]).toEqual(['kvman', 'ibndeif', '^1.95.0', ['ui'], './extension.js']);
    expect(manifest.contributes.viewsContainers.activitybar).toEqual([{ id: 'kvman', title: 'kvman', icon: 'media/view.svg' }]);
    expect(manifest.contributes.views).toEqual({ kvman: [{ type: 'webview', id: 'kvman.view', name: 'kvman' }] });
    expect(manifest.contributes.commands.map((command) => [command.command, command.icon])).toEqual([
      ['kvman.open', undefined],
      ['kvman.showPages', '$(list-unordered)'],
      ['kvman.openSettings', '$(gear)'],
      ['kvman.openInBrowser', '$(link-external)'],
      ['kvman.addToChat', undefined],
      ['kvman.install', undefined],
    ]);
    const menu = (name: string) => (manifest.contributes.menus[name] ?? []).map((item) => [item.command, item.when]);
    expect(menu('view/title')).toEqual([['kvman.showPages', 'view == kvman.view'], ['kvman.openSettings', 'view == kvman.view'], ['kvman.openInBrowser', 'view == kvman.view']]);
    expect(menu('editor/context')).toEqual([['kvman.addToChat', 'editorHasSelection']]);
    expect(menu('explorer/context')).toEqual([['kvman.addToChat', '!explorerResourceIsFolder']]);
    // A folder's own settings can't name the program the extension runs: only the person's user settings can.
    expect(manifest.contributes.configuration.properties).toEqual({ 'kvman.path': { type: 'string', default: 'kvman', scope: 'machine' } });
  });

  it('M4.2-E9 the package is at the root version, private, and depends on zod alone', () => {
    const own = z.object({ version: z.string(), private: z.literal(true), dependencies: z.record(z.string(), z.string()) }).parse(read('package.json'));
    expect(own.version).toBe(z.object({ version: z.string() }).parse(read('../../package.json')).version);
    expect(Object.keys(own.dependencies)).toEqual(['zod']);
    expect(z.object({ devDependencies: z.record(z.string(), z.string()) }).parse(read('package.json')).devDependencies['@types/vscode']).toBe('1.95.0');
  });
});
