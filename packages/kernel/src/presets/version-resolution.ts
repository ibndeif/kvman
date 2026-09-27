import { manifestSchema, type Manifest, type Preset } from '@kvman/protocol';
import type { InstallService } from '../install/install-service.ts';
import { readBuiltinDigests } from '../install/sources.ts';
import type { StagedVersion } from '../install/stage-summary.ts';
import { kernelProblem, ProblemError } from '../problems.ts';
import type { Connection } from '../storage/driver.ts';
import type { PresetEntry } from '../storage/preset-changes.ts';

export type ResolvedVersion = {
  name: string;
  entry: PresetEntry;
  digest: string;
  manifest: Manifest;
  source: string;
  integrity?: string;
  builtin: boolean;
  staged?: StagedVersion;
};

export type VersionResolutionDeps = { install: InstallService; connection: Connection };

// 07 §7.4, ADR 0148: every preset entry, enabled or not, found installed or fetched now; a fetched package that does
// not match the entry's integrity fails PRESET_INTEGRITY_MISMATCH. On any failure every tree staged so far is
// discarded, then the error propagates.
export async function resolveVersions(
  preset: Preset,
  deps: VersionResolutionDeps,
  correlationId: string,
  signal: AbortSignal,
): Promise<ResolvedVersion[]> {
  const resolved: ResolvedVersion[] = [];
  try {
    for (const name of Object.keys(preset.extensions).sort()) {
      const entry = preset.extensions[name];
      if (entry === undefined) continue;
      resolved.push(await resolveEntry(name, entry, deps, correlationId, signal));
    }
    return resolved;
  } catch (error) {
    for (const version of resolved) {
      if (version.staged !== undefined) await deps.install.discardStaged(version.staged);
    }
    throw error;
  }
}

type InstalledRow = { digest: string; source: string; integrity?: string; manifest: Manifest };

function installedRow(connection: Connection, name: string, digest: string): InstalledRow | undefined {
  const row = connection
    .prepare('SELECT digest, source, integrity, manifest FROM extension_versions WHERE name = ? AND digest = ?')
    .get(name, digest);
  if (row === undefined) return undefined;
  const integrity = row['integrity'];
  return {
    digest: String(row['digest']),
    source: String(row['source']),
    ...(typeof integrity === 'string' ? { integrity } : {}),
    manifest: manifestSchema.parse(JSON.parse(String(row['manifest']))),
  };
}

function installedSourceRow(connection: Connection, name: string, source: string, integrity: string | undefined): InstalledRow | undefined {
  if (integrity === undefined) return undefined;
  const row = connection
    .prepare('SELECT digest, source, integrity, manifest FROM extension_versions WHERE name = ? AND source = ? AND integrity = ?')
    .get(name, source, integrity);
  if (row === undefined) return undefined;
  return {
    digest: String(row['digest']),
    source: String(row['source']),
    integrity: String(row['integrity']),
    manifest: manifestSchema.parse(JSON.parse(String(row['manifest']))),
  };
}

// A builtin: entry always uses the bundled version: the installed row with the bundled digest, else a fresh stage.
async function resolveBuiltin(
  name: string,
  entry: PresetEntry,
  deps: VersionResolutionDeps,
  correlationId: string,
  signal: AbortSignal,
): Promise<ResolvedVersion> {
  const bundled = (await readBuiltinDigests(deps.install.paths.builtin))[name]?.digest;
  const installed = bundled === undefined ? undefined : installedRow(deps.connection, name, bundled);
  if (installed !== undefined) {
    return { name, entry, digest: installed.digest, manifest: installed.manifest, source: installed.source, ...(installed.integrity === undefined ? {} : { integrity: installed.integrity }), builtin: true };
  }
  const staged = await deps.install.stageVersion(`builtin:${name}`, correlationId, signal);
  return {
    name, entry, digest: staged.digest, manifest: staged.manifest, source: staged.source,
    ...(staged.integrity === undefined ? {} : { integrity: staged.integrity }), builtin: true, staged,
  };
}

// An npm:/git: entry pinned by its integrity: the installed row with the same source and integrity, else a fresh
// stage, which must match the entry's integrity.
async function resolvePinned(
  name: string,
  entry: PresetEntry,
  deps: VersionResolutionDeps,
  correlationId: string,
  signal: AbortSignal,
): Promise<ResolvedVersion> {
  const installed = installedSourceRow(deps.connection, name, entry.source, entry.integrity);
  if (installed !== undefined) {
    return { name, entry, digest: installed.digest, manifest: installed.manifest, source: installed.source, ...(installed.integrity === undefined ? {} : { integrity: installed.integrity }), builtin: false };
  }
  const staged = await deps.install.stageVersion(entry.source, correlationId, signal);
  if (staged.integrity !== entry.integrity) {
    await deps.install.discardStaged(staged);
    throw new ProblemError(kernelProblem('PRESET_INTEGRITY_MISMATCH', {
      correlationId,
      detail: `the staged ${name} does not match the preset's integrity`,
      params: { name, ...(entry.integrity === undefined ? {} : { expected: entry.integrity }), ...(staged.integrity === undefined ? {} : { actual: staged.integrity }) },
    }));
  }
  return {
    name, entry, digest: staged.digest, manifest: staged.manifest, source: staged.source,
    ...(staged.integrity === undefined ? {} : { integrity: staged.integrity }), builtin: false, staged,
  };
}

function resolveEntry(
  name: string,
  entry: PresetEntry,
  deps: VersionResolutionDeps,
  correlationId: string,
  signal: AbortSignal,
): Promise<ResolvedVersion> {
  return entry.source.startsWith('builtin:')
    ? resolveBuiltin(name, entry, deps, correlationId, signal)
    : resolvePinned(name, entry, deps, correlationId, signal);
}
