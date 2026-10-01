import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The end-to-end and crash tests run kvai, kvwebui, and kvcoder as bundled extensions, from their builds; `pnpm test`
// runs before `pnpm build`, so this builds them first. A failed build throws with its output.
export function setup(): void {
  execFileSync('pnpm', ['--filter', '@kvman/kvai', '--filter', '@kvman/kvwebui', '--filter', '@kvman/kvcoder', 'build'], { cwd: fileURLToPath(new URL('../../../..', import.meta.url)), stdio: 'pipe' });
}
