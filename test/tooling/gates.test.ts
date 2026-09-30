import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository.ts';

const packages = { sdk: '@kvman/sdk', kernel: '@kvman/kernel', cli: 'kvman', testkit: '@kvman/testkit' };

function runScript(script: string): { status: number | null; output: string } {
  const result = spawnSync('pnpm', ['run', script], { cwd: repositoryRoot, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('gates (plan 13 M1.1)', () => {
  it('M1.1-H1 typecheck, lint, and build pass, and every package builds', () => {
    for (const script of ['typecheck', 'lint', 'build']) {
      const { status, output } = runScript(script);
      expect(status, `pnpm ${script}\n${output}`).toBe(0);
    }
    for (const [folder, name] of Object.entries(packages)) {
      const root = path.join(repositoryRoot, 'packages', folder);
      expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toContain(`"name": "${name}"`);
      expect(existsSync(path.join(root, 'dist/index.js')), `${folder}/dist/index.js`).toBe(true);
      expect(existsSync(path.join(root, 'dist/index.d.ts')), `${folder}/dist/index.d.ts`).toBe(true);
    }
  }, 180_000);
});
