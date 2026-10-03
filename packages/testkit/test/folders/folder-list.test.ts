import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const problem = (code: string) => ({ problem: { code } });

function tree(): { root: string; real: string } {
  const root = harness.temporaryFolder();
  for (const name of ['b', 'a', '.hidden']) mkdirSync(path.join(root, name));
  for (const name of ['f.txt', 'g.md']) writeFileSync(path.join(root, name), 'x');
  return { root, real: realpathSync(root) };
}

describe('kernel.folder.list (02 §2.12, ADR 0009, 219)', () => {
  it('QA13-H1 lists the sub-folders of a folder by name, with no file and no hidden folder', async () => {
    const kernel = await harness.start([]);
    const { root, real } = tree();
    expect(await kernel.exec('kernel.folder.list', { path: root })).toEqual({
      path: real,
      parent: path.dirname(real),
      folders: [{ name: 'a', path: path.join(real, 'a') }, { name: 'b', path: path.join(real, 'b') }],
      truncated: false,
    });
  });

  it('QA13-H2 hidden folders come back on request, in name order', async () => {
    const kernel = await harness.start([]);
    const { root } = tree();
    const { folders } = await kernel.exec('kernel.folder.list', { path: root, hidden: true });
    expect(folders.map((folder) => folder.name)).toEqual(['.hidden', 'a', 'b']);
    expect((await kernel.exec('kernel.folder.list', { path: root, hidden: false })).folders.map((folder) => folder.name)).toEqual(['a', 'b']);
  });

  it("QA13-H3 with no path it starts at Home's folder", async () => {
    const kernel = await harness.start([]);
    expect((await kernel.exec('kernel.folder.list', {})).path).toBe(realpathSync(kernel.homeFolder));
  });

  it('QA13-E1 a relative path, a missing one, and a file fail VALIDATION_FAILED and say why', async () => {
    const kernel = await harness.start([]);
    const { root } = tree();
    await expect(kernel.exec('kernel.folder.list', { path: 'relative/folder' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', message: 'A folder path must be absolute.' } });
    await expect(kernel.exec('kernel.folder.list', { path: path.join(root, 'missing') })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', message: expect.stringContaining("can't be read") as unknown } });
    await expect(kernel.exec('kernel.folder.list', { path: path.join(root, 'f.txt') })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', message: 'A folder path must be a folder.' } });
  });

  it('QA13-E2 the root has no parent, and a folder under it has one', async () => {
    const kernel = await harness.start([]);
    const top = path.parse(realpathSync(harness.temporaryFolder())).root;
    expect((await kernel.exec('kernel.folder.list', { path: top })).parent).toBeNull();
    const { root, real } = tree();
    expect((await kernel.exec('kernel.folder.list', { path: root })).parent).toBe(path.dirname(real));
  });

  it('QA13-E3 and QA14-E5 a symlink to a folder is a folder, and a symlink to a file or to nothing is not, in name order with the parallel checks', async () => {
    const kernel = await harness.start([]);
    const { root, real } = tree();
    symlinkSync(path.join(root, 'a'), path.join(root, 'to-folder'));
    symlinkSync(path.join(root, 'f.txt'), path.join(root, 'to-file'));
    symlinkSync(path.join(root, 'gone'), path.join(root, 'to-nothing'));
    const { folders } = await kernel.exec('kernel.folder.list', { path: root });
    expect(folders.map((folder) => folder.name)).toEqual(['a', 'b', 'to-folder']);
    expect(folders.find((folder) => folder.name === 'to-folder')?.path).toBe(path.join(real, 'to-folder'));
  });

  it('QA13-E4 at most 1000 folders come back, the first by name, and truncated says when more were left out', async () => {
    const kernel = await harness.start([]);
    const full = harness.temporaryFolder();
    for (let index = 0; index < 1000; index += 1) mkdirSync(path.join(full, `d${String(index).padStart(4, '0')}`));
    const exact = await kernel.exec('kernel.folder.list', { path: full });
    expect(exact.folders).toHaveLength(1000);
    expect(exact.truncated).toBe(false);
    mkdirSync(path.join(full, 'd1000'));
    const cut = await kernel.exec('kernel.folder.list', { path: full });
    expect(cut.folders).toHaveLength(1000);
    expect(cut.folders[0]?.name).toBe('d0000');
    expect(cut.folders.at(-1)?.name).toBe('d0999');
    expect(cut.truncated).toBe(true);
  });

  it('QA13-E10 the query is public, so an extension may call it, and an unknown key fails VALIDATION_FAILED', async () => {
    const kernel = await harness.start([{ name: '@test/folders', namespace: 'folders', entry: entry('') }]);
    const { root, real } = tree();
    expect(await kernel.exec('kernel.folder.list', { path: root }, { as: '@test/folders' })).toMatchObject({ path: real });
    await expect(kernel.exec('kernel.folder.list', { path: root, files: true } as never)).rejects.toMatchObject(problem('VALIDATION_FAILED'));
  });
});
