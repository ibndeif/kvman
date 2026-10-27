import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Outputs are made in a temporary folder and placed beside their path under a temporary name, then renamed over it,
// so a failed call leaves no file and the old one in place (plan 16 §16.3). The temporary folder may be on another
// disk, so the file is copied beside its path first.

/** A temporary folder for one call's work, deleted with `remove`. */
export function workFolder(): { folder: string; remove(): void } {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvvideo-'));
  return { folder, remove: () => rmSync(folder, { recursive: true, force: true }) };
}

/** Puts a finished file at its output path. */
export function placeOutput(made: string, output: string): void {
  const beside = path.join(path.dirname(output), `.${path.basename(output)}.${randomUUID()}.tmp`);
  try {
    copyFileSync(made, beside);
    renameSync(beside, output);
  } finally {
    rmSync(beside, { force: true });
  }
}
