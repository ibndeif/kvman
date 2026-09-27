import { type Capabilities, type Isolation, type Manifest, type Preset, type Problem } from '@kvman/protocol';
import { readWorkspace } from '../hosts/workspace-rows.ts';
import { referentialIssues } from '../hosts/reload-checks.ts';
import { covers, storedDataVersion } from '../migrations/data-migrations.ts';
import { kernelProblem } from '../problems.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { derivedCapabilities, grantDifferences, type GrantDifferences } from '../registry/grant-validity.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Connection } from '../storage/driver.ts';
import { grantFor, type PlannedExtension } from './apply-grants.ts';
import { configFindingIssue, configFindings, missingRequirements, namespaceClashes, requiresIssues } from './enabled-checks.ts';
import type { ResolvedVersion } from './version-resolution.ts';

// Like enable's grant refusal, at the preset entry's path.
export function grantProblem(name: string, differences: GrantDifferences, correlationId: string): Problem {
  const issues = [
    ...differences.missing.map((label) => ({ path: `extensions.${name}.grants`, message: `missing: ${label}` })),
    ...differences.unexpected.map((label) => ({ path: `extensions.${name}.grants`, message: `not requested: ${label}` })),
    ...(differences.isolation === undefined ? [] : [{ path: `extensions.${name}.grants.isolation`, message: differences.isolation }]),
  ];
  return kernelProblem('CAPABILITY_DENIED', {
    correlationId,
    detail: 'grants are all or nothing: they must equal what the extension requests',
    params: { name, missing: differences.missing, unexpected: differences.unexpected },
    issues,
  });
}

// Check 1: every version's grant (ADR 0148); the first difference is the answer.
export function checkedGrants(versions: readonly ResolvedVersion[], correlationId: string): { ok: true; planned: PlannedExtension[] } | { ok: false; problem: Problem } {
  const planned: PlannedExtension[] = [];
  for (const version of versions) {
    const granted = grantFor(version);
    if (!granted.ok) return { ok: false, problem: grantProblem(version.name, granted.differences, correlationId) };
    planned.push({ name: version.name, version, grants: granted.grants });
  }
  return { ok: true, planned };
}

// Check 2: a version that is not the active one and whose data version the stored data does not cover,
// as reload refuses it (06 §6.6).
export function checkRollback(planned: readonly PlannedExtension[], connection: Connection, registry: RegistryState, correlationId: string): Problem | undefined {
  for (const { name, version } of planned) {
    if (version.digest === registry.digestOf(name)) continue;
    const stored = storedDataVersion(connection, name);
    const target = version.manifest.data.version;
    if (stored === undefined || stored <= target || covers(version.manifest, stored)) continue;
    return kernelProblem('EXT_ROLLBACK_BLOCKED', {
      correlationId,
      detail: `the stored data is at version ${stored}, which version ${version.manifest.meta.version} (data version ${target}) cannot run on`,
      params: { stored, target },
    });
  }
  return undefined;
}

export type SwitchWorkspace = { workspaceId: string; name: string; missing: string[]; unexpected: string[] };

export type SwitchPlan = { name: string; from: string; to: string; workspaces: SwitchWorkspace[]; grants: Record<string, Capabilities> };

// The lowest isolation the manifest allows: what it requested, sandboxed when it requested none, shared for builtins.
function lowestAllowed(manifest: Manifest, builtin: boolean): Isolation {
  if (builtin) return 'shared';
  return manifest.permissions.isolation?.mode ?? 'sandboxed';
}

// Check 3: every installed extension whose digest changes switches everywhere (06 §6.6); the other workspaces it is
// enabled in keep their isolation when still allowed, and the preview names their capability diffs.
export function planSwitches(
  planned: readonly PlannedExtension[],
  input: { workspaceId: string; registry: RegistryState; connection: Connection; correlationId: string },
): { ok: true; switches: SwitchPlan[] } | { ok: false; problem: Problem } {
  const { workspaceId, registry, connection, correlationId } = input;
  const current = registry.current();
  const switches: SwitchPlan[] = [];
  for (const { name, version } of planned) {
    if (registry.digestOf(name) === undefined || version.digest === registry.digestOf(name)) continue;
    const others = [...registry.enabled()].flatMap(([candidate, names]) => (candidate !== workspaceId && names.includes(name) ? [candidate] : []));
    const issues = referentialIssues(current, version.manifest, others);
    if (issues.length > 0) {
      return { ok: false, problem: kernelProblem('VALIDATION_FAILED', { correlationId, detail: 'the new version would break a workspace where the extension is enabled', issues }) };
    }
    const grants: Record<string, Capabilities> = {};
    const workspaces: SwitchWorkspace[] = [];
    for (const other of others) {
      const granted = registry.capabilities(name, other);
      if (granted === undefined) continue;
      const derived = derivedCapabilities(version.manifest);
      const kept = grantDifferences(version.manifest, { ...derived, isolation: granted.isolation }, version.builtin)?.isolation === undefined
        ? granted.isolation
        : lowestAllowed(version.manifest, version.builtin);
      grants[other] = { ...derived, isolation: kept };
      const differences = grantDifferences(version.manifest, granted, version.builtin);
      workspaces.push({
        workspaceId: other,
        name: readWorkspace(connection, other)?.name ?? other,
        missing: differences?.missing ?? [],
        unexpected: differences?.unexpected ?? [],
      });
    }
    switches.push({
      name,
      from: current.manifestOf(name)?.meta.version ?? version.manifest.meta.version,
      to: version.manifest.meta.version,
      workspaces,
      grants,
    });
  }
  return { ok: true, switches };
}

function namespaceProblem(enabled: readonly PlannedExtension[], correlationId: string): Problem | undefined {
  const [first] = namespaceClashes(enabled.map(({ version }) => version.manifest));
  if (first === undefined) return undefined;
  return kernelProblem('NAMESPACE_CONFLICT', { correlationId, detail: `${first.first} and ${first.second} both use the namespace "${first.namespace}" in this workspace` });
}

function requiresProblem(enabled: readonly PlannedExtension[], correlationId: string): Problem | undefined {
  const manifests = enabled.map(({ version }) => version.manifest);
  const missing = missingRequirements(manifests);
  const [first] = missing;
  if (first === undefined) return undefined;
  const types = missing.flatMap(({ name, type }) => (name === first.name ? [type] : []));
  const issues = requiresIssues(manifests).filter((issue) => issue.path === `extensions.${first.name}`);
  return kernelProblem('EXT_REQUIRES_MISSING', {
    correlationId,
    detail: `no extension enabled here provides ${types.join(', ')}`,
    hint: 'enable the extensions that provide them first',
    params: { types },
    issues,
  });
}

// Check 4c: the first config finding as the problem; every finding is an issue of kernel.validate.
function configProblem(
  preset: Preset,
  enabled: readonly PlannedExtension[],
  planned: readonly PlannedExtension[],
  input: { workspaceId: string; connection: Connection; correlationId: string },
): Problem | undefined {
  const { workspaceId, connection, correlationId } = input;
  const findings = configFindings({
    connection,
    workspaceId,
    enabled: enabled.map(({ version }) => version.manifest),
    entries: new Map(planned.map(({ name, version }) => [name, version.manifest] as const)),
    config: preset.config,
  });
  const [first] = findings;
  if (first === undefined) return undefined;
  if (first.kind === 'field') {
    const issues = findings.flatMap((finding) => (finding.kind === 'field' && finding.name === first.name ? [finding.issue] : []));
    return kernelProblem('CONFIG_INVALID', { correlationId, detail: `${first.issue.path}: ${first.issue.message}`, issues });
  }
  if (first.kind === 'not-object') {
    return kernelProblem('CONFIG_INVALID', { correlationId, detail: `the config of ${first.name} is not an object`, issues: [configFindingIssue(first)] });
  }
  return kernelProblem('CONFIG_INVALID', { correlationId, detail: configFindingIssue(first).message, issues: [configFindingIssue(first)] });
}

// Check 4: the target workspace's enabled set against itself: namespaces, requireTypes, and config (ADR 0151).
export function checkEnabledSet(
  planned: readonly PlannedExtension[],
  input: { preset: Preset; registry: KernelRegistry; connection: Connection; workspaceId: string; correlationId: string },
): Problem | undefined {
  const enabled = planned.filter(({ version }) => version.entry.enabled);
  return namespaceProblem(enabled, input.correlationId)
    ?? requiresProblem(enabled, input.correlationId)
    ?? configProblem(input.preset, enabled, planned, input);
}
