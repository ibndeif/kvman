import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { packMirror, repositoryRoot, serveMirror } from '../support/npm-mirror.ts';

// The scaffold and end-to-end tests' setup (ADR 0009, 113, 126): `pnpm test` runs before `pnpm build`, so it builds
// kvman's packages and the bundled extensions first; then it packs the scaffold's packages and serves them.
const built = ['@kvman/sdk', '@kvman/kernel', '@kvman/testkit', '@kvman/kvai', '@kvman/kvwebui', '@kvman/kvcoder', '@kvman/kvcustomizer'];

export async function setup(project: TestProject): Promise<() => Promise<void>> {
  execFileSync('pnpm', [...built.flatMap((name) => ['--filter', name]), 'build'], { cwd: repositoryRoot, stdio: 'pipe' });
  const root = mkdtempSync(path.join(tmpdir(), 'kvcustomizer-mirror-'));
  const mirror = await serveMirror(await packMirror(path.join(root, 'tarballs')));
  project.provide('npmRegistry', mirror.url);
  project.provide('npmCache', path.join(root, 'npm-cache'));
  return async () => {
    await new Promise<void>((resolve) => mirror.server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  };
}
