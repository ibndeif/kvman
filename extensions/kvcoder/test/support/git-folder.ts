import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

// A Git repository in a test's folder, with its own identity and no signing, so the developer's configuration doesn't matter.

const identity = ['-c', 'user.name=Person', '-c', 'user.email=person@example.test', '-c', 'commit.gpgsign=false'];

export const git = (folder: string, ...args: string[]): string => execFileSync('git', [...identity, ...args], { cwd: folder, encoding: 'utf8' }).trim();

/** Writes `file` in `folder` and stages it. */
export function stage(folder: string, file: string, text = `${file}\n`): void {
  writeFileSync(path.join(folder, file), text);
  git(folder, 'add', '--', file);
}

/** The staged paths, as `git diff --cached --name-only` lists them against `HEAD`. */
export const staged = (folder: string): string[] => git(folder, 'diff', '--cached', '--name-only').split('\n').filter((name) => name !== '');

/** Makes `folder` a repository with one commit of `first.txt`. */
export function initRepository(folder: string): void {
  git(folder, 'init', '-q');
  stage(folder, 'first.txt');
  git(folder, 'commit', '-q', '-m', 'first');
}
