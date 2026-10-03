import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { packMirror, repositoryRoot, serveMirror } from '../support/npm-mirror.ts';

// The scaffold tests' setup (plan 12 §12.1, ADR 0010, 2): `pnpm test` runs before `pnpm build`, so it builds the
// testkit's packages first; then it packs the scaffold's packages and serves them. The bin tests start no kvman.
const built = ['@kvman/sdk', '@kvman/kernel', '@kvman/testkit', '@kvman/kvai', '@kvman/kvwebui', '@kvman/kvcoder'];

export async function setup(project: TestProject): Promise<() => Promise<void>> {
  execFileSync('pnpm', [...built.flatMap((name) => ['--filter', name]), 'build'], { cwd: repositoryRoot, stdio: 'pipe' });
  const root = mkdtempSync(path.join(tmpdir(), 'kvman-testkit-mirror-'));
  const mirror = await serveMirror(await packMirror(path.join(root, 'tarballs')));
  project.provide('npmRegistry', mirror.url);
  project.provide('npmCache', path.join(root, 'npm-cache'));
  return async () => {
    await new Promise<void>((resolve) => mirror.server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  };
}
