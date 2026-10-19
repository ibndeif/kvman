import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { searchText, type FileMatches, type Match } from '../../src/files/search-text.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
function workspace(files: Record<string, string>): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvcoder-search-'));
  folders.push(folder);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(folder, name)), { recursive: true });
    writeFileSync(path.join(folder, name), content);
  }
  return folder;
}
const live = new AbortController().signal;
const paths = (result: { files: { path: string }[] }) => result.files.map((file) => file.path);
// A file's lines; a files-only result has none.
const linesOf = (file: FileMatches | undefined): Match[] | undefined => (file !== undefined && 'matches' in file ? file.matches : undefined);

describe('a bounded, stoppable search (KVC-29, ADR 0055)', () => {
  it('M2.4-E168 literal text, a glob by name and by path', async () => {
    const folder = workspace({ 'a.ts': 'price is $5 (a.b)\n', 'src/b.ts': 'axb\n$5 (a.b)\n', 'src/deep/c.ts': '$5 (a.b)\n', 'src/d.md': '$5 (a.b)\n' });
    expect(paths(await searchText(folder, { pattern: '$5 (a.b)', literal: true }, live))).toEqual(['a.ts', 'src/b.ts', 'src/d.md', 'src/deep/c.ts']);
    expect(linesOf((await searchText(folder, { pattern: 'a.b' }, live)).files.find((file) => file.path === 'src/b.ts'))?.map((match) => match.line)).toEqual([1, 2]);
    expect(linesOf((await searchText(folder, { pattern: 'a.b', literal: true }, live)).files.find((file) => file.path === 'src/b.ts'))?.map((match) => match.line)).toEqual([2]);
    expect(paths(await searchText(folder, { pattern: '5', glob: '*.ts' }, live))).toEqual(['a.ts', 'src/b.ts', 'src/deep/c.ts']);
    expect(paths(await searchText(folder, { pattern: '5', glob: 'src/**/*.ts' }, live))).toEqual(['src/b.ts', 'src/deep/c.ts']);
    expect(paths(await searchText(folder, { pattern: '5', path: 'src', glob: '*/c.ts' }, live))).toEqual(['src/deep/c.ts']);
  });

  it('M2.4-E168 in a Git workspace an ignored file is not searched, and outside one it is', async () => {
    const files = { '.gitignore': 'build/\n', 'src/a.txt': 'needle\n', 'build/out.txt': 'needle\n' };
    const plain = workspace(files);
    expect(paths(await searchText(plain, { pattern: 'needle' }, live))).toEqual(['build/out.txt', 'src/a.txt']);
    const repository = workspace(files);
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    expect(paths(await searchText(repository, { pattern: 'needle' }, live))).toEqual(['src/a.txt']);
    expect(paths(await searchText(repository, { pattern: 'needle', path: 'src' }, live))).toEqual(['src/a.txt']);
  });

  it('M2.4-E168 a symlink Git lists, to a file or a folder outside the workspace, is never read', async () => {
    const outside = workspace({ 'secret.txt': 'needle outside\n', 'folder/inner.txt': 'needle outside\n' });
    const repository = workspace({ 'src/a.txt': 'needle\n' });
    symlinkSync(path.join(outside, 'secret.txt'), path.join(repository, 'link.txt'));
    symlinkSync(path.join(outside, 'folder'), path.join(repository, 'linked'));
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    execFileSync('git', ['add', '-A'], { cwd: repository });
    expect(paths(await searchText(repository, { pattern: 'needle' }, live))).toEqual(['src/a.txt']);
    expect(paths(await searchText(repository, { pattern: 'needle', literal: true, glob: '*.txt' }, live))).toEqual(['src/a.txt']);
  });

  it('M2.4-E169 an expression that never finishes is stopped, with what was found before it', async () => {
    const folder = workspace({ 'a.txt': 'aaa!\n', 'b.txt': `${'a'.repeat(40)}!\n`, 'c.txt': 'aaa\n' });
    const started = Date.now();
    const result = await searchText(folder, { pattern: '^(a+)+$' }, live, { fileMs: 100, totalMs: 1_000 });
    expect(Date.now() - started).toBeLessThan(900);
    expect(result).toEqual({ files: [], truncated: true, reason: 'time' });
    const before = await searchText(folder, { pattern: '^(a+)+!?$' }, live, { fileMs: 5_000, totalMs: 5_000 });
    expect(before).toEqual({ files: [{ path: 'a.txt', matches: [{ line: 1, text: 'aaa!' }] }, { path: 'b.txt', matches: [{ line: 1, text: `${'a'.repeat(40)}!` }] }, { path: 'c.txt', matches: [{ line: 1, text: 'aaa' }] }], truncated: false });
  });

  it('M2.4-E169 the match limit says so, and a cancelled search stops', async () => {
    const folder = workspace({ 'many.txt': 'x\n'.repeat(250) });
    const result = await searchText(folder, { pattern: 'x' }, live);
    expect(result).toMatchObject({ truncated: true, reason: 'matches' });
    expect(linesOf(result.files[0])).toHaveLength(200);
    const stopped = new AbortController();
    stopped.abort(new Error('stopped'));
    await expect(searchText(folder, { pattern: 'x' }, stopped.signal)).rejects.toThrow('stopped');
  });
});
