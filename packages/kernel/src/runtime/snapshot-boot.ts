import { InstallFailure } from '../install/install-failure.ts';
import { readBuiltinDigests } from '../install/sources.ts';
import { ProblemError } from '../problems.ts';
import type { ExtensionVersion } from '../storage/extension-changes.ts';
import type { KernelRuntime } from './kernel-runtime.ts';

// 03 §3.9 step 4, 06 §6.5: every snapshot an enabled extension uses is rehashed at boot; a mismatch quarantines the
// extension with EXT_INTEGRITY, with no retry.
export async function verifyEnabledSnapshots(runtime: KernelRuntime): Promise<void> {
  const enabled = new Set([...runtime.registry.enabled().values()].flat());
  for (const extension of [...enabled].sort()) {
    if (runtime.registry.digestOf(extension) === undefined || runtime.registry.current().isQuarantined(extension)) continue;
    if (!(await runtime.snapshots.verify(extension))) await runtime.quarantine(extension, 'EXT_INTEGRITY');
  }
}

// One builtin tarball installed through the pipeline as source builtin:<name> (06 §6.9); its version, as installed.
export async function installBuiltin(runtime: KernelRuntime, name: string, correlationId: string): Promise<ExtensionVersion> {
  try {
    const staged = await runtime.install.stage(`builtin:${name}`, correlationId, new AbortController().signal);
    const version = await runtime.install.confirm(staged.confirmationToken);
    const result = await runtime.pipeline.enqueue({ origin: { kind: 'change', change: { kind: 'install', version }, correlationId }, writes: [], sends: [], publishes: [], replies: [] });
    if (!result.committed) throw new ProblemError(result.problem);
    return version;
  } catch (error) {
    if (error instanceof InstallFailure) throw new ProblemError(error.problem(correlationId));
    throw error;
  }
}

// 06 §6.9, 03 §3.9 first run: every builtin tarball is installed through the same pipeline, offline, as source
// builtin:<name>; installing never enables. A builtin that fails stops the boot (ADR 0115).
export async function installBuiltins(runtime: KernelRuntime, correlationId: string): Promise<void> {
  const names = Object.keys(await readBuiltinDigests(runtime.install.paths.builtin)).sort();
  for (const name of names) await installBuiltin(runtime, name, correlationId);
  runtime.registry.refresh();
}
