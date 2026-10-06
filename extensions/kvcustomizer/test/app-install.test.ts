import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifest, useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });

describe('installing a project of the workspace (09 §9.1, ADR 0022, 6)', { timeout: 60_000 }, () => {
  it('QA34-H6 a path: folder is resolved from the workspace and stored absolute', async () => {
    const { kernel, workspace, write } = await kvcustomizer.start();
    write('notes/package.json', manifest('notes', 'notes'));
    const answer = await kernel.exec('kvcustomizer.app.extensions.install', { name: 'notes', source: 'path:notes' });
    expect(answer).toEqual({ file: expect.any(String), restartRequired: true });
    const preset = await kernel.exec('kvcustomizer.app.preset.get', {});
    expect(preset.extensions['notes']).toBe(`path:${path.join(workspace, 'notes')}`);
    expect(path.isAbsolute(String(preset.extensions['notes']).slice('path:'.length))).toBe(true);
  });

  it('QA34-H7 npm: and bundled sources reach the kernel as given', async () => {
    const { kernel } = await kvcustomizer.start();
    await kernel.exec('kvcustomizer.app.extensions.install', { name: '@acme/notes', source: 'npm:1.2.3' });
    expect((await kernel.exec('kvcustomizer.app.preset.get', {})).extensions['@acme/notes']).toBe('npm:1.2.3');
    await expect(kernel.exec('kvcustomizer.app.extensions.install', { name: '@acme/other', source: 'bundled' })).rejects.toEqual(failed('VALIDATION_FAILED'));
  });

  it("QA34-E7 a folder that isn't a project fails kvcustomizer/NOT_A_PROJECT, and the preset is unchanged", async () => {
    const { kernel, write } = await kvcustomizer.start();
    write('plain/package.json', { name: 'plain', version: '0.1.0' });
    write('empty/.keep', '');
    const before = await kernel.exec('kvcustomizer.app.preset.get', {});
    for (const folder of ['plain', 'empty', 'missing']) {
      await expect(kernel.exec('kvcustomizer.app.extensions.install', { name: folder, source: `path:${folder}` }), folder).rejects.toEqual(failed('kvcustomizer/NOT_A_PROJECT'));
    }
    expect((await kernel.exec('kvcustomizer.app.preset.get', {})).extensions).toEqual(before.extensions);
  });

  it("QA34-E8 a name that isn't the project's fails VALIDATION_FAILED, naming both", async () => {
    const { kernel, write } = await kvcustomizer.start();
    write('notes/package.json', manifest('notes', 'notes'));
    const error = await kernel.exec('kvcustomizer.app.extensions.install', { name: 'other', source: 'path:notes' }).catch((thrown: unknown) => thrown);
    expect(error).toEqual(failed('VALIDATION_FAILED'));
    expect(error).toMatchObject({ problem: { message: 'The project in notes is named notes, not other; install it under its own name.', params: { name: 'other', folder: 'notes', project: 'notes' } } });
    expect((await kernel.exec('kvcustomizer.app.preset.get', {})).extensions['other']).toBeUndefined();
  });

  it('QA34-E9 a folder outside the workspace fails VALIDATION_FAILED', async () => {
    const { kernel } = await kvcustomizer.start();
    await expect(kernel.exec('kvcustomizer.app.extensions.install', { name: 'elsewhere', source: 'path:../elsewhere' })).rejects.toEqual(failed('VALIDATION_FAILED'));
    await expect(kernel.exec('kvcustomizer.app.extensions.install', { name: 'root', source: `path:${path.parse(process.cwd()).root}` })).rejects.toEqual(failed('VALIDATION_FAILED'));
  });
});
