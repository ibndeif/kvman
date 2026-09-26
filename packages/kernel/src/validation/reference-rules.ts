import { matchesTypePattern, type Issue, type Json, type JsonObject } from '@kvman/protocol';
import { arrayAt, objectOf, stringAt } from './json-reading.ts';
import { laneIssues } from './lane-rules.ts';

// The kernel's events a subscription may name, by type, with their payload schemas (ADR 0109).
export type KernelEvents = ReadonlyMap<string, JsonObject | undefined>;

function ownEvents(manifest: JsonObject): Map<string, JsonObject | undefined> {
  const events = arrayAt(manifest, 'types').filter((entry) => stringAt(entry, 'kind') === 'event');
  return new Map(events.flatMap((entry) => {
    const type = stringAt(entry, 'type');
    return type === undefined ? [] : [[type, objectOf(objectOf(entry)?.['payload'])]];
  }));
}

function payloadOf(event: string, own: ReadonlyMap<string, JsonObject | undefined>, kernel: KernelEvents): { schema: JsonObject | undefined } | undefined {
  if (own.has(event)) return { schema: own.get(event) };
  if (kernel.has(event)) return { schema: kernel.get(event) };
  return undefined;
}

// ADR 0109: a subscription lane reads the payload of its own or a kernel event; a foreign event's lane is checked
// at enable, and a wildcard subscription's never.
export function subscriptionLaneIssues(manifest: JsonObject, kernel: KernelEvents): Issue[] {
  const own = ownEvents(manifest);
  return arrayAt(manifest, 'subscriptions').flatMap((subscription, index) => {
    const event = stringAt(subscription, 'event');
    const lane = stringAt(subscription, 'lane');
    if (event === undefined || lane === undefined || event.endsWith('.*')) return [];
    const payload = payloadOf(event, own, kernel);
    if (payload === undefined) return [];
    return laneIssues({ path: `subscriptions.${index}.lane`, lane, schema: payload.schema, describedAs: 'event payload' });
  });
}

function callPatterns(manifest: JsonObject): string[] {
  return arrayAt(manifest['permissions'], 'capabilities')
    .filter((capability) => stringAt(capability, 'name') === 'calls')
    .flatMap((capability) => arrayAt(capability, 'types').filter((type): type is string => typeof type === 'string'));
}

function strings(values: Json[]): string[] {
  return values.filter((value): value is string => typeof value === 'string');
}

// ADR 0107: each required type is its own, a kernel type, covered by `calls`, or one of its subscriptions.
export function requiredTypeIssues(manifest: JsonObject): Issue[] {
  const own = new Set(strings(arrayAt(manifest, 'types').map((entry) => stringAt(entry, 'type') ?? null)));
  const patterns = [...callPatterns(manifest), ...strings(arrayAt(manifest, 'subscriptions').map((entry) => stringAt(entry, 'event') ?? null))];
  return arrayAt(manifest['permissions'], 'requireTypes').flatMap((requirement, index) => arrayAt(requirement, 'types').flatMap((type, position) => {
    if (typeof type !== 'string' || own.has(type) || type.startsWith('kernel.') || patterns.some((pattern) => matchesTypePattern(pattern, type))) return [];
    return [{
      path: `permissions.requireTypes.${index}.types.${position}`,
      message: `"${type}" is required, but no requested capability covers it`,
      hint: `add ext.requestCapability('calls', { types: ['${type}'] }), or subscribe to it if it is an event`,
    }];
  }));
}
