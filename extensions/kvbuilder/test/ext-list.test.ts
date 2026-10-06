import { describe, expect, it } from 'vitest';
import { manifest, useKvbuilder } from './support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });

describe('ext list, and the project rules of ext check and ext test (09 §9.1, ADR 0009, 126)', { timeout: 30_000 }, () => {
  it('M2.5-E7 lists the folder itself and nested projects, skipping node_modules, dot-folders, and folders inside a project', async () => {
    const world = await kvbuilder.start();
    world.write('package.json', manifest('root-ext', 'root-ext'));
    expect(await world.kernel.exec('kvbuilder.ext.list', {})).toEqual([{ folder: '.', name: 'root-ext', namespace: 'root-ext', version: '0.1.0' }]);
    const other = await kvbuilder.start();
    other.write('zeta/package.json', manifest('zeta', 'zeta'));
    other.write('apps/notes/package.json', manifest('@me/notes', 'notes'));
    other.write('apps/notes/inner/package.json', manifest('inner', 'inner'));
    other.write('node_modules/hidden/package.json', manifest('hidden', 'hidden'));
    other.write('.cache/dot/package.json', manifest('dot', 'dot'));
    other.write('plain/package.json', { name: 'plain', version: '1.0.0' });
    expect(await other.kernel.exec('kvbuilder.ext.list', {})).toEqual([
      { folder: 'apps/notes', name: '@me/notes', namespace: 'notes', version: '0.1.0' },
      { folder: 'zeta', name: 'zeta', namespace: 'zeta', version: '0.1.0' },
    ]);
  });

  it('M2.5-E8 a folder that is not a project fails kvbuilder/NOT_A_PROJECT, and one outside the workspace VALIDATION_FAILED', async () => {
    const world = await kvbuilder.start();
    world.write('plain/package.json', { name: 'plain', version: '1.0.0' });
    world.write('empty/readme.txt', 'no manifest');
    for (const name of ['kvbuilder.ext.check', 'kvbuilder.ext.test'] as const) {
      await expect(world.kernel.exec(name, { folder: 'plain' })).rejects.toEqual(failed('kvbuilder/NOT_A_PROJECT'));
      await expect(world.kernel.exec(name, { folder: 'empty' })).rejects.toEqual(failed('kvbuilder/NOT_A_PROJECT'));
      await expect(world.kernel.exec(name, { folder: '../elsewhere' })).rejects.toEqual(failed('VALIDATION_FAILED'));
    }
  });
});
