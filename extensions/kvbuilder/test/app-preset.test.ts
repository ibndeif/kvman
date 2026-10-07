import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvbuilder } from './support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();
const failed = (code: string, file?: string) => expect.objectContaining({ problem: expect.objectContaining({ code, ...(file === undefined ? {} : { params: { file } }) }) });

const newPreset = (name: string, extensions: Record<string, string> = {}) => ({
  name,
  extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', ...extensions },
  settings: { 'kvwebui.home': 'kvwebui.extensions' },
});

describe('the running preset and workspace preset commands (ADR 0030)', { timeout: 60_000 }, () => {
  it('QA42-H11 preset-set and preset-reset wrap the kernel and return the edit answer', async () => {
    const { kernel } = await kvbuilder.start();
    const result = await kernel.exec('kvbuilder.app.preset.settings.set', { key: 'kvwebui.title', value: 'notes.app.title' });
    expect(result).toEqual({ file: expect.stringMatching(/presets[\\/]test\.json$/), restartRequired: true });
    expect((await kernel.exec('kvbuilder.app.preset.get', {})).settings?.['kvwebui.title']).toBe('notes.app.title');
    await kernel.exec('kvbuilder.app.preset.settings.set', { key: 'kvwebui.theme', value: 'dark' });
    expect(await kernel.exec('kvbuilder.app.preset.settings.reset', { key: 'kvwebui.theme' })).toEqual(result);
    expect((await kernel.exec('kvbuilder.app.preset.get', {})).settings).not.toHaveProperty('kvwebui.theme');
    expect(JSON.parse(readFileSync(result.file, 'utf8'))).toMatchObject({ settings: { 'kvwebui.title': 'notes.app.title' } });
  });

  it('QA42-H12 preset-save resolves paths relative to the workspace preset file', async () => {
    const { kernel, workspace, write } = await kvbuilder.start();
    expect(await kernel.exec('kvbuilder.preset.new', { name: 'notes-app', file: 'apps/notes-app.json' })).toEqual({ file: 'apps/notes-app.json' });
    write('apps/notes-app.json', newPreset('notes-app', { notes: 'path:../notes' }));
    const result = await kernel.exec('kvbuilder.app.preset.save', { file: 'apps/notes-app.json' });
    expect(result).toEqual({ file: expect.stringMatching(/home[\\/]presets[\\/]notes-app\.json$/), name: 'notes-app' });
    expect(JSON.parse(readFileSync(result.file, 'utf8'))).toEqual(newPreset('notes-app', { notes: `path:${path.join(workspace, 'notes')}` }));
    expect((await kernel.exec('kernel.preset.get', {})).name).not.toBe('notes-app');
  });

  it('QA42-E15 the kernel Problems for setting edits and saving pass through', async () => {
    const { kernel, write } = await kvbuilder.start();
    await expect(kernel.exec('kvbuilder.app.preset.settings.set', { key: 'kvwebui.theme', value: 42 })).rejects.toEqual(failed('VALIDATION_FAILED'));
    await expect(kernel.exec('kvbuilder.app.preset.settings.reset', { key: 'kvwebui.theme' })).rejects.toEqual(failed('NOT_FOUND'));
    write('notes-app.json', newPreset('notes-app'));
    const first = await kernel.exec('kvbuilder.app.preset.save', { file: 'notes-app.json' });
    await expect(kernel.exec('kvbuilder.app.preset.save', { file: 'notes-app.json' })).rejects.toEqual(failed('VALIDATION_FAILED'));
    expect(await kernel.exec('kvbuilder.app.preset.save', { file: 'notes-app.json', replace: true })).toEqual(first);
  });

  it('QA42-E16 preset-save refuses files outside the workspace, missing files, invalid JSON, and invalid presets', async () => {
    const { kernel, workspace, write } = await kvbuilder.start();
    await expect(kernel.exec('kvbuilder.app.preset.save', { file: '../out.json' })).rejects.toEqual(failed('VALIDATION_FAILED', '../out.json'));
    await expect(kernel.exec('kvbuilder.app.preset.save', { file: 'missing.json' })).rejects.toEqual(failed('NOT_FOUND', 'missing.json'));
    write('broken.json', '{');
    await expect(kernel.exec('kvbuilder.app.preset.save', { file: 'broken.json' })).rejects.toEqual(failed('VALIDATION_FAILED', 'broken.json'));
    write('not-preset.json', { name: 'notes-app', extensions: {}, unexpected: true });
    await expect(kernel.exec('kvbuilder.app.preset.save', { file: 'not-preset.json' })).rejects.toEqual(failed('VALIDATION_FAILED', 'not-preset.json'));
    expect((await kernel.exec('kernel.preset.get', {})).name).not.toBe('notes-app');
    await expect(kernel.exec('kvbuilder.app.preset.save', { file: 'presets/notes-app.json' })).rejects.toEqual(failed('NOT_FOUND', 'presets/notes-app.json'));
    expect(path.isAbsolute(workspace)).toBe(true);
  });

  it('QA42-E17 absolute path, bundled, and npm sources remain unchanged', async () => {
    const { kernel, workspace, write } = await kvbuilder.start();
    const preset = newPreset('sources-app', { notes: `path:${path.join(workspace, 'already-absolute')}`, remote: 'npm:1.2.3' });
    write('sources-app.json', preset);
    const saved = await kernel.exec('kvbuilder.app.preset.save', { file: 'sources-app.json' });
    expect(JSON.parse(readFileSync(saved.file, 'utf8'))).toEqual(preset);
  });
});
