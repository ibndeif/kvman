import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The preset the start benchmarks run (plan 12 §12.3, ADR 0009, 115; ADR 0011, 27): the bundled coder preset plus
// `kernel.workers: 3`, the 4-core reference machine's default, so a result doesn't depend on the cores of the machine
// that measures it.

const coderPreset = fileURLToPath(new URL('../packages/cli/presets/coder.json', import.meta.url));

function withWorkers(preset: unknown): unknown {
  if (typeof preset !== 'object' || preset === null || !('settings' in preset) || typeof preset.settings !== 'object') throw new Error('packages/cli/presets/coder.json has no settings');
  return { ...preset, settings: { ...preset.settings, 'kernel.workers': 3 } };
}

/** Writes the reference preset under `root` and returns its file. */
export function writeReferencePreset(root: string): string {
  const file = path.join(root, 'coder-reference.json');
  writeFileSync(file, JSON.stringify(withWorkers(JSON.parse(readFileSync(coderPreset, 'utf8')))));
  return file;
}
