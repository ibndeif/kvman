import { chmodSync, existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const refused = { problem: { code: 'VALIDATION_FAILED' } };

describe('kernel.folder.create (02 §2.12, ADR 0009, 222)', () => {
  it('QA14-H1 makes the folder, answers its real path, and the list shows it', async () => {
    const kernel = await harness.start([]);
    const root = harness.temporaryFolder();
    const made = await kernel.exec('kernel.folder.create', { path: root, name: 'new project' });
    expect(made).toEqual({ path: path.join(realpathSync(root), 'new project') });
    expect(statSync(made.path).isDirectory()).toBe(true);
    expect((await kernel.exec('kernel.folder.list', { path: root })).folders.map((folder) => folder.name)).toEqual(['new project']);
  });

  it('QA14-E1 refuses a bad name and makes nothing, and a name of 255 characters works', async () => {
    const kernel = await harness.start([]);
    const root = harness.temporaryFolder();
    for (const name of ['', '   ', 'a/b', 'a\\b', '.', '..', 'a\u0000b', 'x'.repeat(256)]) {
      await expect(kernel.exec('kernel.folder.create', { path: root, name }), JSON.stringify(name).slice(0, 20)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', params: { name: name.trim() } } });
    }
    expect((await kernel.exec('kernel.folder.list', { path: root, hidden: true })).folders).toEqual([]);
    const long = 'y'.repeat(255);
    expect(existsSync((await kernel.exec('kernel.folder.create', { path: root, name: long })).path)).toBe(true);
  });

  it('QA14-E2 an existing name, a bad parent, and a parent that cannot be written fail VALIDATION_FAILED and say why', async () => {
    const kernel = await harness.start([]);
    const root = harness.temporaryFolder();
    mkdirSync(path.join(root, 'taken'));
    writeFileSync(path.join(root, 'file.txt'), 'x');
    await expect(kernel.exec('kernel.folder.create', { path: root, name: 'taken' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', message: 'A folder or file named taken already exists here.' } });
    await expect(kernel.exec('kernel.folder.create', { path: root, name: 'file.txt' })).rejects.toMatchObject({ problem: { message: 'A folder or file named file.txt already exists here.' } });
    await expect(kernel.exec('kernel.folder.create', { path: 'relative', name: 'x' })).rejects.toMatchObject({ problem: { message: 'A folder path must be absolute.' } });
    await expect(kernel.exec('kernel.folder.create', { path: path.join(root, 'missing'), name: 'x' })).rejects.toMatchObject(refused);
    await expect(kernel.exec('kernel.folder.create', { path: path.join(root, 'file.txt'), name: 'x' })).rejects.toMatchObject({ problem: { message: 'A folder path must be a folder.' } });
    // A read-only folder can be simulated only where permissions bind the user: not on Windows, and not as root.
    if (process.platform !== 'win32' && process.getuid?.() !== 0) {
      const locked = path.join(root, 'locked');
      mkdirSync(locked);
      chmodSync(locked, 0o555);
      await expect(kernel.exec('kernel.folder.create', { path: locked, name: 'x' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', message: expect.stringContaining("can't be made") as unknown } });
      chmodSync(locked, 0o755);
    }
  });

  it('QA14-E4 the name is trimmed, only one level is made, and an extension may call it', async () => {
    const kernel = await harness.start([{ name: '@test/folders', namespace: 'folders', entry: entry('') }]);
    const root = harness.temporaryFolder();
    const made = await kernel.exec('kernel.folder.create', { path: root, name: '  tidy  ' }, { as: '@test/folders' });
    expect(path.basename(made.path)).toBe('tidy');
    expect(path.dirname(made.path)).toBe(realpathSync(root));
    await expect(kernel.exec('kernel.folder.create', { path: root, name: 'deep/er' })).rejects.toMatchObject(refused);
    expect(existsSync(path.join(root, 'deep'))).toBe(false);
    await expect(kernel.exec('kernel.folder.create', { path: root, name: 'x', extra: true } as never)).rejects.toMatchObject(refused);
  });
});
