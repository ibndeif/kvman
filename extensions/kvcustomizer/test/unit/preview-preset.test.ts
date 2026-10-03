import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstPreviewPort, lastPreviewPort, previewCommand, previewPort, previewPreset } from '../../src/preview/preview-preset.ts';

const notes = { name: '@me/notes', folder: path.resolve('/work/notes') };

describe("the preview's preset and command line (09 §9.3, ADR 0009, 119, 126)", () => {
  it('M2.5-E32 the generated preset, and a given preset with absolute path: entries and the dev extensions over its own', () => {
    expect(previewPreset([notes])).toEqual({
      name: 'preview',
      extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', '@me/notes': `path:${notes.folder}` },
      settings: { 'kvwebui.home': 'kvwebui.extensions' },
    });
    const given = { preset: { name: 'app', extensions: { '@kvman/kvai': 'bundled' as const, '@me/notes': 'path:./old-notes' as const, '@me/other': 'path:../other' as const, '@acme/x': 'npm:1.2.3' as const }, settings: { 'kvwebui.home': 'notes.hello', 'kernel.workers': 2 } }, folder: path.resolve('/work/presets') };
    expect(previewPreset([notes], given)).toEqual({
      name: 'app',
      extensions: { '@kvman/kvai': 'bundled', '@me/notes': `path:${notes.folder}`, '@me/other': `path:${path.resolve('/work/other')}`, '@acme/x': 'npm:1.2.3' },
      settings: { 'kvwebui.home': 'notes.hello', 'kernel.workers': 2 },
    });
  });

  it("M2.5-E33 the command line is this kvman's Node, flags, and entry; the port search runs from 3738 to 3837", async () => {
    expect(previewCommand({ execPath: '/bin/node', execArgv: ['--conditions=@kvman/source'], entry: '/app/main.ts', home: '/tmp/kvman-preview-w1', port: 3739, presetFile: '/tmp/kvman-preview-w1/preview-preset.json' })).toEqual({
      command: '/bin/node',
      args: ['--conditions=@kvman/source', '/app/main.ts', '--home', '/tmp/kvman-preview-w1', '--port', '3739', '--yes', '--no-open', '--preset', '/tmp/kvman-preview-w1/preview-preset.json'],
    });
    const tried: number[] = [];
    expect(await previewPort((port) => Promise.resolve(tried.push(port) > 2))).toBe(3740);
    expect(tried).toEqual([3738, 3739, 3740]);
    expect(await previewPort(() => Promise.resolve(false))).toBeUndefined();
    expect([firstPreviewPort, lastPreviewPort]).toEqual([3738, 3837]);
  });
});
