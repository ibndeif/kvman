import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { internalPackageNames, repositoryRoot } from './repository.ts';

function runScript(script: string): { status: number | null; output: string } {
  const result = spawnSync('pnpm', ['run', script], { cwd: repositoryRoot, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('gates (plan 14 §14.4)', () => {
  it('M0.1-H1 every script passes on the empty packages', () => {
    for (const script of ['typecheck', 'lint', 'build']) {
      const { status, output } = runScript(script);
      expect(status, `pnpm ${script}\n${output}`).toBe(0);
    }
    for (const name of internalPackageNames) {
      expect(existsSync(path.join(repositoryRoot, 'packages', name, 'dist/index.js'))).toBe(true);
      expect(existsSync(path.join(repositoryRoot, 'packages', name, 'dist/index.d.ts'))).toBe(true);
    }
  }, 180_000);
});
