import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository.ts';

// Each package and the entry its build must emit: the libraries' `index`, and the CLI's bin, `main`.
const packages = {
  sdk: { name: '@kvman/sdk', entry: 'index' },
  kernel: { name: '@kvman/kernel', entry: 'index' },
  cli: { name: 'kvman', entry: 'main' },
  testkit: { name: '@kvman/testkit', entry: 'index' },
};

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
    for (const [folder, { name, entry }] of Object.entries(packages)) {
      const root = path.join(repositoryRoot, 'packages', folder);
      expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toContain(`"name": "${name}"`);
      expect(existsSync(path.join(root, `dist/${entry}.js`)), `${folder}/dist/${entry}.js`).toBe(true);
      expect(existsSync(path.join(root, `dist/${entry}.d.ts`)), `${folder}/dist/${entry}.d.ts`).toBe(true);
    }
  }, 180_000);
});
