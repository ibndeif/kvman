import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { presetSchema, type Preset } from '@kvman/protocol';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import { isUnreadable } from '../install/file-errors.ts';
import { kernelProblem, ProblemError } from '../problems.ts';
import type { Connection } from '../storage/driver.ts';
import type { KernelChange } from '../storage/kernel-changes.ts';
import type { KernelRuntime } from './kernel-runtime.ts';

// 07 §7.4, ADR 0146: the built-in presets a boot seeds into the catalog, one file per preset named <id>.json.
async function presetFiles(runtime: KernelRuntime): Promise<string[]> {
  try {
    const entries = await readdir(join(runtime.install.paths.builtin, 'presets'), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name).sort();
  } catch (error) {
    if (isUnreadable(error)) return [];
    throw error;
  }
}

async function readPreset(runtime: KernelRuntime, file: string): Promise<Preset | undefined> {
  const text = await readFile(join(runtime.install.paths.builtin, 'presets', file), 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  const checked = presetSchema.safeParse(parsed);
  return checked.success ? checked.data : undefined;
}

async function commitChange(runtime: KernelRuntime, change: KernelChange, correlationId: string): Promise<void> {
  const result = await runtime.pipeline.enqueue({ origin: { kind: 'change', change, correlationId }, writes: [], sends: [], publishes: [], replies: [] });
  if (!result.committed) throw new ProblemError(result.problem);
}

// 03 §3.9, ADR 0146: after the builtin extensions are installed, every bundled preset becomes a catalog row with
// builtin = 1. A file that is not a valid preset refuses a first run; on an upgrade it is logged and skipped, and
// a built-in row that is no longer bundled is deleted. Applied copies are never touched.
export async function seedBuiltinPresets(runtime: KernelRuntime, connection: Connection, mode: 'first-run' | 'upgrade', logger: KernelLogger, correlationId: string): Promise<void> {
  const files = await presetFiles(runtime);
  for (const file of files) {
    const preset = await readPreset(runtime, file);
    if (preset === undefined) {
      if (mode === 'first-run') {
        throw new ProblemError(kernelProblem('PRESET_INVALID', { correlationId, detail: `the built-in preset ${file} is not a valid preset` }));
      }
      logger.write({ level: 'warn', message: 'a built-in preset is not valid and was skipped', fields: { file }, attributes: { correlationId } });
      continue;
    }
    await commitChange(runtime, { kind: 'catalog.write', preset, builtin: true, cause: 'seed' }, correlationId);
  }
  if (mode === 'first-run') return;
  const bundled = new Set(files.map((file) => file.slice(0, -'.json'.length)));
  const rows = connection.prepare('SELECT id FROM presets WHERE builtin = 1').all().map((row) => String(row['id'])).sort();
  for (const presetId of rows) {
    if (bundled.has(presetId)) continue;
    await commitChange(runtime, { kind: 'catalog.delete', presetId, cause: 'seed' }, correlationId);
  }
}
