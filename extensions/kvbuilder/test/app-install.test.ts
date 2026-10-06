import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifest, useKvbuilder } from './support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });

describe('installing a project of the workspace (09 §9.1, ADR 0022, 6, ADR 0025)', { timeout: 60_000 }, () => {
  it('QA37-H8 a path: folder is resolved from the workspace and stored absolute', async () => {
    const { kernel, workspace, write } = await kvbuilder.start();
    write('notes/package.json', manifest('notes', 'notes'));
    const answer = await kernel.exec('kvbuilder.app.extensions.install', { source: 'path:notes' });
    expect(answer).toEqual({ file: expect.any(String), restartRequired: true });
    const preset = await kernel.exec('kvbuilder.app.preset.get', {});
    expect(preset.extensions['notes']).toBe(`path:${path.join(workspace, 'notes')}`);
    expect(path.isAbsolute(String(preset.extensions['notes']).slice('path:'.length))).toBe(true);
  });

  it('QA37-H9 npm: and bundled: sources reach the kernel as given', async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.exec('kvbuilder.app.extensions.install', { source: 'npm:@acme/notes@1.2.3' });
    expect((await kernel.exec('kvbuilder.app.preset.get', {})).extensions['@acme/notes']).toBe('npm:1.2.3');
    await expect(kernel.exec('kvbuilder.app.extensions.install', { source: 'bundled:@acme/other' })).rejects.toEqual(failed('VALIDATION_FAILED'));
  });

  it("QA37-E8 a folder that isn't a project fails kvbuilder/NOT_A_PROJECT, and the preset is unchanged", async () => {
    const { kernel, write } = await kvbuilder.start();
    write('plain/package.json', { name: 'plain', version: '0.1.0' });
    write('empty/.keep', '');
    const before = await kernel.exec('kvbuilder.app.preset.get', {});
    for (const folder of ['plain', 'empty', 'missing']) {
      await expect(kernel.exec('kvbuilder.app.extensions.install', { source: `path:${folder}` }), folder).rejects.toEqual(failed('kvbuilder/NOT_A_PROJECT'));
    }
    expect((await kernel.exec('kvbuilder.app.preset.get', {})).extensions).toEqual(before.extensions);
  });

  it('QA37-E9 a name in the payload fails VALIDATION_FAILED, and the preset is unchanged', async () => {
    const { kernel, write } = await kvbuilder.start();
    write('notes/package.json', manifest('notes', 'notes'));
    const before = await kernel.exec('kvbuilder.app.preset.get', {});
    await expect(kernel.exec('kvbuilder.app.extensions.install', { name: 'notes', source: 'path:notes' } as never)).rejects.toEqual(failed('VALIDATION_FAILED'));
    expect((await kernel.exec('kvbuilder.app.preset.get', {})).extensions).toEqual(before.extensions);
  });

  it('QA37-E7 a folder outside the workspace fails VALIDATION_FAILED', async () => {
    const { kernel } = await kvbuilder.start();
    await expect(kernel.exec('kvbuilder.app.extensions.install', { source: 'path:../elsewhere' })).rejects.toEqual(failed('VALIDATION_FAILED'));
    await expect(kernel.exec('kvbuilder.app.extensions.install', { source: `path:${path.parse(process.cwd()).root}` })).rejects.toEqual(failed('VALIDATION_FAILED'));
  });
});
