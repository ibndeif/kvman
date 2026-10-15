import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { npmEnvironment } from '../support/npm-environment.ts';
import { runBin } from '../support/run-bin.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root(): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvman-new-git-'));
  roots.push(folder);
  return folder;
}

const outputSchema = z.object({ folder: z.string(), name: z.string(), namespace: z.string(), web: z.boolean() }).strict();
const git = (args: readonly string[], cwd: string): string => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });

// A PATH of its own (a POSIX shell's, like the machines these tests run on): node and npm, and, when given, a fake
// `git` script in place of the real one.
function pathWith(parent: string, fakeGit?: string): string {
  const bin = path.join(parent, 'bin');
  mkdirSync(bin);
  symlinkSync(process.execPath, path.join(bin, 'node'));
  const npm = execFileSync('which', ['npm'], { encoding: 'utf8' }).trim();
  symlinkSync(execFileSync('realpath', [npm], { encoding: 'utf8' }).trim(), path.join(bin, 'npm'));
  if (fakeGit !== undefined) {
    writeFileSync(path.join(bin, 'git'), fakeGit);
    chmodSync(path.join(bin, 'git'), 0o755);
  }
  return bin;
}

const scaffold = (cwd: string, env: Record<string, string> = {}) => runBin('new/new-bin.js', ['notes', '--name', 'notes', '--namespace', 'notes', '--json'], { cwd, env: { ...npmEnvironment(), ...env } });

describe('kvman-new starts a Git repository (10, ADR 0082, 16)', () => {
  it('QA52-H3 a new project outside a work tree gets git init with no commit, a .gitignore, and the same output', async () => {
    const parent = root();
    const run = await scaffold(parent);
    expect(run.exitCode).toBe(0);
    const folder = path.join(parent, 'notes');
    expect(outputSchema.parse(JSON.parse(run.stdout))).toEqual({ folder, name: 'notes', namespace: 'notes', web: false });
    expect(existsSync(path.join(folder, '.git'))).toBe(true);
    expect(() => git(['rev-parse', 'HEAD'], folder)).toThrow();
    expect(readFileSync(path.join(folder, '.gitignore'), 'utf8')).toBe('node_modules/\ndist/\n');
  });

  it('QA52-E2 with no git on the PATH, or inside a work tree, no repository is started, and the .gitignore is still written', async () => {
    const bare = root();
    const run = await scaffold(bare, { PATH: pathWith(bare) });
    expect(run.exitCode).toBe(0);
    expect(existsSync(path.join(bare, 'notes', '.git'))).toBe(false);
    expect(readFileSync(path.join(bare, 'notes', '.gitignore'), 'utf8')).toBe('node_modules/\ndist/\n');

    const repository = root();
    git(['init', '--quiet'], repository);
    const inside = await scaffold(repository);
    expect(inside.exitCode).toBe(0);
    expect(existsSync(path.join(repository, 'notes', '.git'))).toBe(false);
    expect(existsSync(path.join(repository, 'notes', '.gitignore'))).toBe(true);
  });

  it('QA52-E3 a git init that fails fails GIT_FAILED with its last lines, and the files stay', async () => {
    const parent = root();
    const fake = '#!/bin/sh\nif [ "$1" = "init" ]; then echo "fatal: cannot init here" >&2; exit 1; fi\nexit 128\n';
    const run = await scaffold(parent, { PATH: pathWith(parent, fake) });
    expect(run.exitCode).toBe(1);
    const failure = z.object({ code: z.string(), message: z.string() }).loose().parse(JSON.parse(run.stderr));
    expect(failure.code).toBe('GIT_FAILED');
    expect(failure.message).toContain('fatal: cannot init here');
    expect(existsSync(path.join(parent, 'notes', 'package.json'))).toBe(true);
  });
});
