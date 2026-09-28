import { canonicalJson, type Capabilities, type GrantsRequiredParams, type Isolation, type Issue, type Manifest } from '@kvman/protocol';
import { grantDifferences, prunedGrant } from '../registry/grant-validity.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import { kernelTypeEntries } from '../registry/kernel-types.ts';

const kernelTypes = new Set(kernelTypeEntries().map((entry) => entry.type));

function requiredTypes(manifest: Manifest): string[] {
  return manifest.permissions.requireTypes.flatMap((requirement) => requirement.types);
}

function typesOf(manifest: Manifest): Set<string> {
  return new Set(manifest.types.map((entry) => entry.type));
}

// 06 §6.6 step 1: in each workspace where the extension is enabled, the target keeps its namespace free, finds the
// types it requires, and still provides the types the other enabled extensions require.
export function referentialIssues(registry: KernelRegistry, target: Manifest, workspaces: readonly string[]): Issue[] {
  const { name, namespace } = target.meta;
  return workspaces.flatMap((workspaceId) => {
    const path = `workspaces.${workspaceId}`;
    const others = registry.manifestsEnabledIn(workspaceId).filter((manifest) => manifest.meta.name !== name);
    const issues: Issue[] = [];
    const owner = others.find((manifest) => manifest.meta.namespace === namespace);
    if (owner !== undefined) issues.push({ path, message: `${owner.meta.name} owns the namespace "${namespace}" here` });
    const providerOwners = new Map<string, string>();
    for (const manifest of others) for (const provider of manifest.llm.providers) providerOwners.set(provider.id, manifest.meta.name);
    for (const provider of target.llm.providers) {
      const ownerName = providerOwners.get(provider.id);
      if (ownerName !== undefined) issues.push({ path, message: `${ownerName} provides "${provider.id}" here` });
    }
    const provided = new Set([...others.flatMap((manifest) => [...typesOf(manifest)]), ...typesOf(target)]);
    for (const type of requiredTypes(target).filter((required) => !provided.has(required) && !kernelTypes.has(required))) {
      issues.push({ path, message: `the new version requires ${type}, which no extension enabled here provides` });
    }
    const targetTypes = typesOf(target);
    for (const dependent of others) {
      for (const type of requiredTypes(dependent).filter((required) => !targetTypes.has(required) && registry.manifestOf(name)?.types.some((entry) => entry.type === required) === true)) {
        issues.push({ path, message: `${dependent.meta.name} requires ${type}, which the new version no longer provides` });
      }
    }
    return issues;
  });
}

export type CapabilityPlan =
  | { kind: 'granted'; grants: Record<string, Capabilities> }
  | { kind: 'required'; params: GrantsRequiredParams }
  | { kind: 'refused'; code: 'CAPABILITY_DENIED' | 'VALIDATION_FAILED'; detail: string; issues: Issue[] };

// 06 §6.6 step 2, ADR 0145: each workspace's grants after the reload. Given grants must equal the target's requests
// and name enabled workspaces; the others keep theirs minus what the target no longer requests, and any that then
// lack a capability or isolation make the reload wait for grants.
export function capabilityPlan(target: { digest: string; manifest: Manifest; builtin: boolean }, current: ReadonlyMap<string, Capabilities>, given: Record<string, Capabilities> | undefined): CapabilityPlan {
  const unknown = Object.keys(given ?? {}).filter((workspaceId) => !current.has(workspaceId));
  if (unknown.length > 0) {
    return { kind: 'refused', code: 'VALIDATION_FAILED', detail: 'grants name workspaces where the extension is not enabled', issues: unknown.map((workspaceId) => ({ path: `grants.${workspaceId}`, message: 'the extension is not enabled here' })) };
  }
  const grants: Record<string, Capabilities> = {};
  const required: GrantsRequiredParams['workspaces'] = [];
  for (const [workspaceId, granted] of current) {
    const sent = given?.[workspaceId];
    if (sent !== undefined) {
      const differences = grantDifferences(target.manifest, sent, target.builtin);
      if (differences !== undefined) {
        const issues = [...differences.missing.map((label) => ({ path: `grants.${workspaceId}`, message: `missing: ${label}` })), ...differences.unexpected.map((label) => ({ path: `grants.${workspaceId}`, message: `not requested: ${label}` }))];
        if (differences.isolation !== undefined) issues.push({ path: `grants.${workspaceId}.isolation`, message: differences.isolation });
        return { kind: 'refused', code: 'CAPABILITY_DENIED', detail: 'grants are all or nothing: they must equal what the new version requests', issues };
      }
      grants[workspaceId] = sent;
      continue;
    }
    const kept = prunedGrant(target.manifest, granted);
    const differences = grantDifferences(target.manifest, kept, target.builtin);
    if (differences === undefined) grants[workspaceId] = kept;
    else required.push({ workspaceId, missing: differences.missing, ...(differences.isolation === undefined ? {} : { isolation: differences.isolation }) });
  }
  return required.length > 0 ? { kind: 'required', params: { digest: target.digest, workspaces: required } } : { kind: 'granted', grants };
}

const isolationOrder: readonly Isolation[] = ['shared', 'dedicated', 'sandboxed'];

// 04 §4.8: a migration runs at the most isolated level granted where the extension is enabled; sandboxed with none.
export function mostIsolated(grants: Iterable<Capabilities>): Isolation {
  const levels = [...grants].map((grant) => isolationOrder.indexOf(grant.isolation));
  return levels.length === 0 ? 'sandboxed' : isolationOrder[Math.max(...levels)] ?? 'sandboxed';
}

function timing(schedule: Manifest['schedules'][number]): string {
  return canonicalJson({ every: schedule.every ?? null, cron: schedule.cron ?? null, command: schedule.command, payload: schedule.payload ?? null });
}

// ADR 0144: the schedules whose runs a reload cancels: those the new version removed or changed in every, cron,
// command, or payload.
export function changedSchedules(active: Manifest | undefined, target: Manifest): string[] {
  const next = new Map(target.schedules.map((schedule) => [schedule.name, timing(schedule)]));
  return (active?.schedules ?? []).filter((schedule) => next.get(schedule.name) !== timing(schedule)).map((schedule) => schedule.name);
}
