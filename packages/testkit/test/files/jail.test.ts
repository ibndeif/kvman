import { existsSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { temporaryFolder } from '../workspaces/harness.ts';
import { fileTests, files, openFilesFixture, writeIn, type FilesFixture } from './harness.ts';

let fixture: FilesFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function outside(): string {
  const folder = temporaryFolder('outside');
  writeFileSync(join(folder, 'secret.txt'), 'secret');
  return folder;
}

describe('the ctx.files jail (plan 07 §7.2, ADR 0136)', fileTests, () => {
  it('M2.5-H2 a symlink out of the workspace fails WORKSPACE_ESCAPE', async () => {
    const open = await openFilesFixture();
    fixture = open;
    const target = outside();
    symlinkSync(target, join(open.root, 'out'));
    for (const payload of [{ op: 'read', path: 'out/secret.txt' }, { op: 'list', path: 'out' }, { op: 'write', path: 'out/new.txt', content: 'x' }]) {
      expect(await files(open, 'filer.run', payload), payload.op).toMatchObject({ code: 'WORKSPACE_ESCAPE' });
    }
    expect(existsSync(join(target, 'new.txt'))).toBe(false);
  });

  it('M2.5-E25 the jail', async () => {
    const open = await openFilesFixture({ homeInside: true });
    fixture = open;
    const target = outside();
    symlinkSync(join(target, 'secret.txt'), join(open.root, 'link.txt'));
    writeIn(open.root, 'notes/a.md', 'a');
    symlinkSync(join(open.root, 'notes'), join(open.root, 'inner'));
    for (const path of ['../x', join(target, 'secret.txt'), 'a/../../x', 'link.txt', 'home/kvman.db']) {
      expect(await files(open, 'filer.run', { op: 'read', path }), path).toMatchObject({ code: 'WORKSPACE_ESCAPE' });
    }
    expect(await files(open, 'filer.run', { op: 'read', path: 'inner/a.md' })).toEqual({ value: 'a' });
    expect(await files(open, 'filer.run', { op: 'glob', pattern: '../*' })).toMatchObject({ code: 'WORKSPACE_ESCAPE' });
  });
});
