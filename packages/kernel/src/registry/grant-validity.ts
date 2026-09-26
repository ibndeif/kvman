import type { Capabilities, Isolation, Manifest } from '@kvman/protocol';

// A foreign subscription is a derived capability (05 §5.7); the extension's own namespace and kernel.* events are not.
function foreign(event: string, namespace: string): boolean {
  return !event.startsWith('kernel.') && !event.startsWith(`${namespace}.`);
}

// What a grant must hold exactly (05 §5.7): the manifest's requests, without their reasons, and what it derives.
export function derivedCapabilities(manifest: Manifest): Pick<Capabilities, 'requested' | 'derived'> {
  const { namespace } = manifest.meta;
  return {
    requested: manifest.permissions.capabilities.map((request) => (request.name === 'calls' ? { name: 'calls', types: request.types } : { name: request.name })),
    derived: {
      subscribes: [...new Set(manifest.subscriptions.map((subscription) => subscription.event).filter((event) => foreign(event, namespace)))],
      providesLlm: manifest.llm.providers.map((provider) => provider.id),
    },
  };
}

export type GrantDifferences = { missing: string[]; unexpected: string[]; isolation?: string };

function labels(capabilities: Pick<Capabilities, 'requested' | 'derived'>): Set<string> {
  return new Set([
    ...capabilities.requested.flatMap((capability) => (capability.name === 'calls' ? capability.types.map((type) => `calls ${type}`) : [capability.name])),
    ...capabilities.derived.subscribes.map((event) => `subscribes ${event}`),
    ...capabilities.derived.providesLlm.map((provider) => `providesLlm ${provider}`),
  ]);
}

const isolationOrder: readonly Isolation[] = ['shared', 'dedicated', 'sandboxed'];

// ADR 0128: isolation is the level the manifest requested or any higher one (sandboxed when it requested none);
// builtin extensions run shared (05 §5.7).
function isolationProblem(manifest: Manifest, grant: Capabilities, builtin: boolean): string | undefined {
  if (builtin) return grant.isolation === 'shared' ? undefined : `a builtin extension runs shared, not ${grant.isolation}`;
  const requested = manifest.permissions.isolation?.mode ?? 'sandboxed';
  if (isolationOrder.indexOf(grant.isolation) >= isolationOrder.indexOf(requested)) return undefined;
  return `${grant.isolation} isolation is lower than the ${requested} the extension requested`;
}

// ADR 0123: a grant is valid only when it equals the manifest's capabilities, all or nothing; undefined when valid.
export function grantDifferences(manifest: Manifest, grant: Capabilities, builtin: boolean): GrantDifferences | undefined {
  const expected = labels(derivedCapabilities(manifest));
  const given = labels(grant);
  const missing = [...expected].filter((label) => !given.has(label)).sort();
  const unexpected = [...given].filter((label) => !expected.has(label)).sort();
  const isolation = isolationProblem(manifest, grant, builtin);
  if (missing.length === 0 && unexpected.length === 0 && isolation === undefined) return undefined;
  return { missing, unexpected, ...(isolation === undefined ? {} : { isolation }) };
}

// Two grants are the same when they hold the same capabilities and isolation, in any order.
export function sameGrants(left: Capabilities, right: Capabilities): boolean {
  const leftLabels = labels(left);
  const rightLabels = labels(right);
  return left.isolation === right.isolation && leftLabels.size === rightLabels.size && [...leftLabels].every((label) => rightLabels.has(label));
}
