import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The end-to-end tests run kvwebui as a bundled extension, from its build (ADR 0009, 67); `pnpm test` runs before
// `pnpm build`, so this builds it first. A failed build throws with its output.
export function setup(): void {
  execFileSync('pnpm', ['--filter', '@kvman/kvwebui', 'build'], { cwd: fileURLToPath(new URL('../../../..', import.meta.url)), stdio: 'pipe' });
}
