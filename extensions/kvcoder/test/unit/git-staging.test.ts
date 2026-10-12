import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { restoreStaging, stagedPathsBetween, stagingMark } from '../../src/delegate/git-staging.ts';
import { git, initRepository, stage, staged } from '../support/git-folder.ts';

const folders: string[] = [];
const folder = (): string => {
  const made = mkdtempSync(path.join(tmpdir(), 'kvcoder-staging-'));
  folders.push(made);
  return made;
};
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true });
});

const signal = new AbortController().signal;
const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

describe('marks of the Git staging area (08 §8.5, ADR 0060, 4)', () => {
  it('M2.4-E199 a folder outside Git has no mark, an unborn repository the empty tree and no head, and a conflicted index none', async () => {
    const outside = folder();
    expect(await stagingMark(outside, signal)).toBeUndefined();

    const unborn = folder();
    git(unborn, 'init', '-q');
    expect(await stagingMark(unborn, signal)).toEqual({ tree: emptyTree, head: null });

    const conflicted = folder();
    initRepository(conflicted);
    const base = git(conflicted, 'rev-parse', '--abbrev-ref', 'HEAD');
    git(conflicted, 'checkout', '-q', '-b', 'other');
    stage(conflicted, 'first.txt', 'theirs\n');
    git(conflicted, 'commit', '-q', '-m', 'theirs');
    git(conflicted, 'checkout', '-q', base);
    stage(conflicted, 'first.txt', 'ours\n');
    git(conflicted, 'commit', '-q', '-m', 'ours');
    expect(() => git(conflicted, 'merge', '-q', 'other')).toThrow();
    expect(await stagingMark(conflicted, signal)).toBeUndefined();
  });

  it("M2.4-E199 a mark leaves the index file's bytes as they were, counts the staged paths that differ, and restore puts a tree back without touching files", async () => {
    const made = folder();
    initRepository(made);
    stage(made, 'mine.txt');
    const index = path.join(made, '.git', 'index');
    const bytes = readFileSync(index);
    const before = await stagingMark(made, signal);
    expect(readFileSync(index).equals(bytes)).toBe(true);
    expect(before).toEqual({ tree: expect.stringMatching(/^[0-9a-f]{40,64}$/) as unknown, head: git(made, 'rev-parse', 'HEAD') });

    stage(made, 'theirs.txt');
    stage(made, 'mine.txt', 'changed\n');
    const after = await stagingMark(made, signal);
    expect(await stagedPathsBetween(made, before?.tree ?? '', after?.tree ?? '', signal)).toBe(2);

    await restoreStaging(made, before?.tree ?? '', signal);
    expect(staged(made)).toEqual(['mine.txt']);
    expect(git(made, 'show', ':mine.txt')).toBe('mine.txt');
    expect(readFileSync(path.join(made, 'mine.txt'), 'utf8')).toBe('changed\n');
    writeFileSync(path.join(made, 'unrelated.txt'), 'x');
    expect((await stagingMark(made, signal))?.tree).toBe(before?.tree);
  });
});
