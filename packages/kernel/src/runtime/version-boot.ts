import gt from 'semver/functions/gt.js';
import { readInstalledVersion, activeDigestOf } from '../hosts/extension-versions.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import { readBuiltinDigests } from '../install/sources.ts';
import { ProblemError } from '../problems.ts';
import type { Connection } from '../storage/driver.ts';
import type { KernelRuntime } from './kernel-runtime.ts';
import { installBuiltin } from './snapshot-boot.ts';

function warn(logger: KernelLogger, message: string, fields: Record<string, string>, correlationId: string): void {
  logger.write({ level: 'warn', message, fields, attributes: { correlationId } });
}

// 03 §3.9 step 5, 04 §4.8: every migration `extensions.migrating` still records is finished (or quarantined); boot
// continues either way.
export async function resumeMigrations(runtime: KernelRuntime, connection: Connection, logger: KernelLogger, correlationId: string): Promise<void> {
  const names = connection.prepare('SELECT name FROM extensions WHERE migrating IS NOT NULL ORDER BY name').all().map((row) => String(row['name']));
  for (const name of names) {
    const outcome = await runtime.versions.resume(name, correlationId);
    if (!outcome.ok) warn(logger, 'an interrupted migration did not finish', { extension: name, code: outcome.problem.code }, correlationId);
  }
  runtime.registry.refresh();
}

// A recorded kvman version older than the running one means this boot is an upgrade (03 §3.9).
export function isUpgrade(recorded: string | undefined, running: string): boolean {
  return recorded !== undefined && gt(running, recorded);
}

// 03 §3.9, ADR 0145: on an upgrade, every bundled builtin whose digest is not installed is installed; one whose version
// is higher than the active version's becomes active, by a reload where it is enabled and a switch where it is not.
// A builtin that fails is logged and boot continues.
export async function upgradeBuiltins(runtime: KernelRuntime, connection: Connection, logger: KernelLogger, correlationId: string): Promise<void> {
  const bundled = await readBuiltinDigests(runtime.install.paths.builtin);
  for (const [name, { digest }] of Object.entries(bundled).sort(([left], [right]) => left.localeCompare(right))) {
    if (readInstalledVersion(connection, name, digest) !== undefined) continue;
    const active = activeDigestOf(connection, name);
    try {
      const installed = await installBuiltin(runtime, name, correlationId);
      const current = active === undefined ? undefined : readInstalledVersion(connection, name, active);
      if (current === undefined || !gt(installed.manifest.meta.version, current.manifest.meta.version)) continue;
      runtime.registry.refresh();
      const outcome = await runtime.versions.reload({ name, digest: installed.digest }, { correlationId });
      if (!outcome.ok) warn(logger, 'an upgraded builtin was not activated', { extension: name, code: outcome.problem.code }, correlationId);
    } catch (error) {
      if (!(error instanceof ProblemError)) throw error;
      warn(logger, 'a bundled builtin was not installed', { extension: name, code: error.problem.code }, correlationId);
    }
  }
  runtime.registry.refresh();
}
