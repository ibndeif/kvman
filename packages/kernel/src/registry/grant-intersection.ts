import type { Capabilities, Isolation } from '@kvman/protocol';

const isolationOrder: readonly Isolation[] = ['shared', 'dedicated', 'sandboxed'];

function common<T>(lists: ReadonlyArray<readonly T[]>): T[] {
  const [first = [], ...rest] = lists;
  return first.filter((item) => rest.every((list) => list.includes(item)));
}

function callPatterns(grant: Capabilities): string[] {
  return grant.requested.flatMap((capability) => (capability.name === 'calls' ? capability.types : []));
}

function plainNames(grant: Capabilities): string[] {
  return grant.requested.flatMap((capability) => (capability.name === 'calls' ? [] : [capability.name]));
}

// 06 §6.4, ADR 0123: a global invocation runs with what every workspace that enables the extension granted, at the
// most isolated of their levels.
export function intersectGrants(grants: readonly Capabilities[]): Capabilities | undefined {
  const [first] = grants;
  if (first === undefined) return undefined;
  const calls = common(grants.map(callPatterns));
  const plain = first.requested.filter((capability) => capability.name !== 'calls' && grants.every((grant) => plainNames(grant).includes(capability.name)));
  const isolation = isolationOrder[Math.max(...grants.map((grant) => isolationOrder.indexOf(grant.isolation)))] ?? 'sandboxed';
  return {
    isolation,
    requested: [...(calls.length === 0 ? [] : [{ name: 'calls' as const, types: calls }]), ...plain],
    derived: {
      subscribes: common(grants.map((grant) => grant.derived.subscribes)),
      providesLlm: common(grants.map((grant) => grant.derived.providesLlm)),
    },
  };
}
