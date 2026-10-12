import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { candidateGateOrder, packageEmissions } from '../../release/candidate/candidate-plan.ts';
import { repositoryRoot } from './repository.ts';

// Vitest keeps lightweight structural coverage only (KVC34, ADR 0047). The
// repository-wide subprocess gates run explicitly with
// `node release/candidate/local-candidate-main.ts`, never nested here.

describe('candidate gates (KVC34, ADR 0047)', () => {
  it('keeps the documented gate order with test and bench once each', () => {
    expect(candidateGateOrder).toEqual(['typecheck', 'lint', 'test', 'build', 'emissions', 'bench:check']);
  });

  it('verifies the original four package names and emitted entries', () => {
    expect(packageEmissions).toEqual([
      { folder: 'sdk', name: '@kvman/sdk', entry: 'index' },
      { folder: 'kernel', name: '@kvman/kernel', entry: 'index' },
      { folder: 'cli', name: 'kvman', entry: 'main' },
      { folder: 'testkit', name: '@kvman/testkit', entry: 'index' },
    ]);
  });

  it('keeps the explicit runner beside the plan and outside release/desktop', () => {
    const main = path.join(repositoryRoot, 'release', 'candidate', 'local-candidate-main.ts');
    const runner = path.join(repositoryRoot, 'release', 'candidate', 'run-candidate.ts');
    const plan = path.join(repositoryRoot, 'release', 'candidate', 'candidate-plan.ts');
    for (const file of [main, runner, plan]) expect(existsSync(file), file).toBe(true);
    const text = readFileSync(main, 'utf8');
    for (const gate of ['typecheck', 'lint', 'test', 'build', 'bench:check', 'emissions']) {
      expect(text, gate).toContain(gate);
    }
    expect(text).toContain('process.platform');
    expect(text).toContain('process.arch');
    expect(text).toContain('spawnSync');
  });

  it('holds no nested repository-wide gates', () => {
    const text = readFileSync(path.join(repositoryRoot, 'test', 'tooling', 'gates.test.ts'), 'utf8');
    const childProcessModule = `${'node:child'}_${'process'}`;
    const previousTimeout = `${'180'}_${'000'}`;
    expect(text).not.toContain(childProcessModule);
    expect(text).not.toContain(previousTimeout);
  });
});
