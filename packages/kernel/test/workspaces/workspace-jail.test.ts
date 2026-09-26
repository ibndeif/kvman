import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PathEscape, resolveInJail } from '../../src/index.ts';

function folders(): { root: string; home: string; outside: string } {
  const base = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'kvman-jail-')));
  const root = path.join(base, 'workspace');
  const home = path.join(root, 'home');
  const outside = path.join(base, 'outside');
  for (const folder of [root, home, outside, path.join(root, 'notes'), path.join(root, '.kvman', 'rules'), path.join(home, 'previews', 'p')]) mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  writeFileSync(path.join(root, 'notes', 'a.md'), 'a');
  symlinkSync(outside, path.join(root, 'out'));
  symlinkSync(path.join(root, 'notes'), path.join(root, 'inner'));
  symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'link.txt'));
  symlinkSync(path.join(root, 'notes', 'a.md'), path.join(root, '.kvman', 'rules', 'linked.md'));
  return { root, home, outside };
}

describe('the path jail (plan 07 §7.2, ADR 0136)', () => {
  it('M2.5-E26 paths resolve inside the root; escapes and the home folder are refused, except a preview root', () => {
    const { root, home } = folders();
    const jail = { root, home };
    expect(resolveInJail(jail, 'notes/a.md')).toEqual({ real: path.join(root, 'notes', 'a.md'), relative: 'notes/a.md', gated: false });
    expect(resolveInJail(jail, 'inner/a.md').real).toBe(path.join(root, 'notes', 'a.md'));
    expect(resolveInJail(jail, 'notes/new/deep.md')).toMatchObject({ relative: 'notes/new/deep.md' });
    expect(resolveInJail(jail, '.')).toMatchObject({ relative: '.', gated: false });
    expect(resolveInJail(jail, '.kvman/rules/x.md')).toMatchObject({ gated: true });
    expect(resolveInJail(jail, '.kvman/rules/linked.md')).toEqual({ real: path.join(root, 'notes', 'a.md'), relative: 'notes/a.md', gated: true });
    expect(resolveInJail(jail, path.join(root, 'notes'))).toMatchObject({ relative: 'notes' });
    for (const escape of ['../x', 'a/../../x', '/etc/passwd', 'out/secret.txt', 'out/new.txt', 'link.txt', 'home/kvman.db', 'home']) {
      expect(() => resolveInJail(jail, escape), escape).toThrow(PathEscape);
    }
    const preview = { root: path.join(home, 'previews', 'p'), home };
    expect(resolveInJail(preview, 'x.md').relative).toBe('x.md');
    expect(() => resolveInJail(preview, '../other')).toThrow(PathEscape);
  });
});
