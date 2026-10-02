import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveInWorkspace } from '../../src/files/workspace-path.ts';

let root: string;
let workspace: string;
let outside: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'kvcoder-path-')));
  workspace = path.join(root, 'workspace');
  outside = path.join(root, 'outside');
  mkdirSync(workspace);
  mkdirSync(outside);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const refused = (requested: string) => expect(resolveInWorkspace(workspace, requested)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });

describe('resolveInWorkspace (08 §8.5, ADR 0009, 158)', () => {
  it('QA4-H6 a relative path and an absolute path inside the folder resolve, whether or not they exist yet', async () => {
    writeFileSync(path.join(workspace, 'here.txt'), 'x');
    expect(await resolveInWorkspace(workspace, 'here.txt')).toBe(path.join(workspace, 'here.txt'));
    expect(await resolveInWorkspace(workspace, path.join(workspace, 'here.txt'))).toBe(path.join(workspace, 'here.txt'));
    expect(await resolveInWorkspace(workspace, 'a/b/new.txt')).toBe(path.join(workspace, 'a', 'b', 'new.txt'));
    expect(await resolveInWorkspace(workspace, './a/../here.txt')).toBe(path.join(workspace, 'here.txt'));
  });

  it('QA4-H6 a workspace folder that is itself reached through a symlink works', async () => {
    const alias = path.join(root, 'alias');
    symlinkSync(workspace, alias);
    expect(await resolveInWorkspace(alias, 'new.txt')).toBe(path.join(workspace, 'new.txt'));
  });

  it('QA4-E1 an absolute path elsewhere and a path that climbs out are refused', async () => {
    await refused(path.join(outside, 'file.txt'));
    await refused('/etc/passwd');
    await refused('../outside/file.txt');
    await refused('a/../../outside/file.txt');
    await refused(root);
  });

  it('QA4-E2 a symlinked folder or file that points out is refused', async () => {
    symlinkSync(outside, path.join(workspace, 'link'));
    writeFileSync(path.join(outside, 'secret.txt'), 'x');
    symlinkSync(path.join(outside, 'secret.txt'), path.join(workspace, 'secret-link.txt'));
    await refused('link/file.txt');
    await refused('secret-link.txt');
    expect(existsSync(path.join(outside, 'file.txt'))).toBe(false);
  });

  it('QA4-E2 a symlink inside the folder to somewhere inside it resolves to its target', async () => {
    mkdirSync(path.join(workspace, 'real'));
    symlinkSync(path.join(workspace, 'real'), path.join(workspace, 'alias'));
    expect(await resolveInWorkspace(workspace, 'alias/file.txt')).toBe(path.join(workspace, 'real', 'file.txt'));
  });

  it('QA4-E3 a new file is checked on its nearest existing ancestor, and a symlink to nothing is refused', async () => {
    symlinkSync(outside, path.join(workspace, 'a'));
    await refused('a/b/c.txt');
    symlinkSync(path.join(outside, 'not-there.txt'), path.join(workspace, 'dangling.txt'));
    await refused('dangling.txt');
    expect(existsSync(path.join(outside, 'not-there.txt'))).toBe(false);
  });
});
