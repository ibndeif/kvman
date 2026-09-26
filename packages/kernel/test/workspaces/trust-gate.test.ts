import { mkdirSync, mkdtempSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashFile, TrustGate } from '../../src/index.ts';

function workspace(): { id: string; path: string } {
  const root = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'kvman-gate-')));
  mkdirSync(path.join(root, '.kvman', 'rules'), { recursive: true });
  writeFileSync(path.join(root, '.kvman', 'rules', 'a.md'), 'a');
  writeFileSync(path.join(root, '.kvman', 'rules', 'b.md'), 'b');
  return { id: 'a'.repeat(64), path: root };
}

describe('the trust gate (plan 07 §7.2, ADR 0137)', () => {
  it('M2.5-E36 unchanged files are not rehashed; a restart rehashes once; a changed stat rehashes that file only', async () => {
    const folder = workspace();
    const hashed: string[] = [];
    const spy = (file: string): Promise<string> => {
      hashed.push(path.relative(folder.path, file));
      return hashFile(file);
    };
    const gate = new TrustGate(spy);
    const files = await gate.preview(folder);
    const trust = { mode: 'always' as const, files };
    expect(hashed.splice(0)).toEqual(['.kvman/rules/a.md', '.kvman/rules/b.md']);
    expect([await gate.intact(folder, trust), await gate.intact(folder, trust)]).toEqual([true, true]);
    expect(hashed.splice(0)).toEqual([]);
    const restarted = new TrustGate(spy);
    expect([await restarted.intact(folder, trust), await restarted.intact(folder, trust)]).toEqual([true, true]);
    expect(hashed.splice(0).sort()).toEqual(['.kvman/rules/a.md', '.kvman/rules/b.md']);
    const later = new Date(Date.now() + 60_000);
    utimesSync(path.join(folder.path, '.kvman', 'rules', 'b.md'), later, later);
    expect(await restarted.intact(folder, trust)).toBe(true);
    expect(hashed.splice(0)).toEqual(['.kvman/rules/b.md']);
  });
});
