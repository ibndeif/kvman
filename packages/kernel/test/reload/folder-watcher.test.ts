import { mkdirSync, mkdtempSync, rmSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchFolderTree, type WatchFolder } from '../../src/reload/folder-tree.ts';
import { reloadQuietMs, watchExtensions } from '../../src/reload/watcher.ts';
import { captureLog } from '../log-capture.ts';

// The extension watcher (plan 02 §2.9, ADR 0085, 8): folders, not files, on Linux; the native recursive watch elsewhere.

const roots: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function extensionFolder(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'kvman-watch-'));
  roots.push(root);
  for (const folder of ['src/parts', 'locales', 'node_modules/a', '.git/objects', '.cache-test']) mkdirSync(path.join(root, folder), { recursive: true });
  writeFileSync(path.join(root, 'src', 'index.ts'), '');
  return root;
}

type Watched = { folder: string; recursive: boolean; closed: boolean; fire(filename: string | null): void };

function fakeWatch(): { watch: WatchFolder; watched: Watched[]; open(): Watched[] } {
  const watched: Watched[] = [];
  const watch: WatchFolder = (folder, options, listener) => {
    const entry: Watched = { folder, recursive: options.recursive, closed: false, fire: (filename) => listener('rename', filename) };
    watched.push(entry);
    return { close: () => (entry.closed = true), on: () => undefined };
  };
  return { watch, watched, open: () => watched.filter((entry) => !entry.closed) };
}

const relative = (root: string, entries: Watched[]): string[] => entries.map((entry) => path.relative(root, entry.folder)).sort();
const failOnError = (error: Error): never => {
  throw error;
};

describe('the extension watcher (ADR 0085, 8)', () => {
  it('QA53-H6 on Linux the watcher watches folders, not files', () => {
    const root = extensionFolder();
    const fake = fakeWatch();
    watchFolderTree(root, 'linux', fake.watch, () => undefined, failOnError);
    expect(relative(root, fake.open())).toEqual(['', 'locales', 'src', path.join('src', 'parts')]);
    expect(fake.watched.every((entry) => !entry.recursive)).toBe(true);
  });

  it('QA53-H7 on Linux a new folder is watched and its change reloads', async () => {
    vi.useFakeTimers();
    const root = extensionFolder();
    const fake = fakeWatch();
    const reloads: string[][] = [];
    const watcher = watchExtensions(new Map([['@test/x', root]]), captureLog().logger, (changed) => {
      reloads.push([...changed]);
      return Promise.resolve();
    }, { platform: 'linux', watch: fake.watch });
    mkdirSync(path.join(root, 'src', 'new'));
    fake.open().find((entry) => entry.folder === path.join(root, 'src'))?.fire('new');
    expect(relative(root, fake.open())).toContain(path.join('src', 'new'));
    writeFileSync(path.join(root, 'src', 'new', 'a.ts'), '');
    fake.open().find((entry) => entry.folder === path.join(root, 'src', 'new'))?.fire('a.ts');
    await vi.advanceTimersByTimeAsync(reloadQuietMs - 1);
    expect(reloads).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(reloads).toEqual([['@test/x']]);
    await watcher.close();
  });

  it('QA53-H8 on macOS and Windows the native recursive watch stays', () => {
    for (const platform of ['darwin', 'win32'] as const) {
      const root = extensionFolder();
      const fake = fakeWatch();
      let changes = 0;
      watchFolderTree(root, platform, fake.watch, () => (changes += 1), failOnError);
      expect(fake.watched.map((entry) => ({ folder: entry.folder, recursive: entry.recursive }))).toEqual([{ folder: root, recursive: true }]);
      const [native] = fake.watched;
      native?.fire(path.join('src', 'a.ts'));
      expect(changes).toBe(1);
      for (const skipped of [path.join('node_modules', 'x', 'i.js'), path.join('.git', 'index'), path.join('.cache-test', 'f')]) native?.fire(skipped);
      expect(changes).toBe(1);
    }
  });

  it('QA53-E4 on Linux a removed folder is dropped', () => {
    const root = extensionFolder();
    const fake = fakeWatch();
    watchFolderTree(root, 'linux', fake.watch, () => undefined, failOnError);
    const src = () => fake.open().find((entry) => entry.folder === path.join(root, 'src'));
    rmSync(path.join(root, 'src', 'parts'), { recursive: true });
    src()?.fire('parts');
    expect(relative(root, fake.open())).not.toContain(path.join('src', 'parts'));
    mkdirSync(path.join(root, 'src', 'parts'));
    src()?.fire('parts');
    expect(relative(root, fake.open())).toContain(path.join('src', 'parts'));
  });

  it('QA53-E5 on Linux skipped folders stay skipped', () => {
    const root = extensionFolder();
    const fake = fakeWatch();
    let changes = 0;
    watchFolderTree(root, 'linux', fake.watch, () => (changes += 1), failOnError);
    const before = fake.watched.length;
    const top = fake.open().find((entry) => entry.folder === root);
    for (const folder of [path.join('node_modules', 'b'), path.join('.git', 'refs'), '.research-extraction-test-x']) {
      mkdirSync(path.join(root, folder), { recursive: true });
      writeFileSync(path.join(root, folder, 'f'), '');
      top?.fire(folder.split(path.sep)[0] ?? folder);
    }
    expect(fake.watched.length).toBe(before);
    expect(changes).toBe(0);
  });

  it('QA53-E6 many folders stay within a few watches', () => {
    const root = extensionFolder();
    for (let index = 0; index < 50; index += 1) {
      const folder = path.join(root, 'node_modules', `package-${String(index)}`);
      mkdirSync(folder, { recursive: true });
      for (let file = 0; file < 20; file += 1) writeFileSync(path.join(folder, `${String(file)}.js`), '');
    }
    let made = 0;
    const counting: WatchFolder = (folder, options, listener) => {
      made += 1;
      return watch(folder, options, listener);
    };
    const tree = watchFolderTree(root, 'linux', counting, () => undefined, failOnError);
    expect(made).toBe(4);
    tree.close();
  });
});
