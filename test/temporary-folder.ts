import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Vitest global setup: each run gets one temporary folder, which its tests, and the child kernels and processes they
// start, reach through TMPDIR; it is removed when the run ends, so homes, snapshots, and workspaces never pile up in a
// RAM-backed /tmp. Each project that extends the root config runs it, so every folder made is removed.
const folders: string[] = [];

export function setup(): void {
  const folder = mkdtempSync(join(tmpdir(), 'kvman-run-'));
  folders.push(folder);
  process.env['TMPDIR'] = folder;
}

export function teardown(): void {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
}
