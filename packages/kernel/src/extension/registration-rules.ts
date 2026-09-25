import type { Issue } from '@kvman/protocol';
import type { DataVersion, Recording, TypeName } from './recording.ts';

const kindArticles: Record<TypeName['kind'], string> = { command: 'a command', query: 'a query', event: 'an event' };

function publicNameIssues(namespace: string, names: readonly string[], pathOf: (index: number) => string): Issue[] {
  return names.flatMap((name, index) => (name.startsWith(`${namespace}.`)
    ? []
    : [{ path: pathOf(index), message: `public names start with the namespace "${namespace}."`, hint: `did you mean "${namespace}.${name}"?` }]));
}

function errorCodeIssues(namespace: string, codes: readonly string[]): Issue[] {
  return codes.flatMap((code, index) => {
    if (code.startsWith(`${namespace}/`)) return [];
    const bareCode = code.slice(code.indexOf('/') + 1);
    return [{ path: `errors.${index}.code`, message: `error codes start with the namespace "${namespace}/"`, hint: `did you mean "${namespace}/${bareCode}"?` }];
  });
}

function duplicateIssues(names: readonly string[], pathOf: (index: number) => string, describe: (firstIndex: number) => string): Issue[] {
  const firstIndexes = new Map<string, number>();
  return names.flatMap((name, index) => {
    const firstIndex = firstIndexes.get(name);
    if (firstIndex === undefined) {
      firstIndexes.set(name, index);
      return [];
    }
    return [{ path: pathOf(index), message: `"${name}" is already registered${describe(firstIndex)}` }];
  });
}

function dataVersionIssues({ version, compatibleWith, steps }: DataVersion): Issue[] {
  const issues: Issue[] = [];
  const seenSteps = new Set<number>();
  steps.forEach((to, index) => {
    if (!Number.isInteger(to) || to < 2 || to > version) {
      issues.push({ path: `data.migrations.${index}.to`, message: `a migration goes to a version from 2 to the data version ${version}` });
    } else if (seenSteps.has(to)) {
      issues.push({ path: `data.migrations.${index}.to`, message: `there is already a migration to version ${to}` });
    }
    seenSteps.add(to);
  });
  for (let to = 2; to <= version; to += 1) {
    if (!seenSteps.has(to)) issues.push({ path: 'data.migrations', message: `no migration to version ${to}; each version from 2 to ${version} needs one` });
  }
  const seenVersions = new Set<number>();
  compatibleWith.forEach((compatible, index) => {
    if (compatible >= version) {
      issues.push({ path: `data.compatibleWith.${index}`, message: `compatible versions are lower than the data version ${version}` });
    } else if (seenVersions.has(compatible)) {
      issues.push({ path: `data.compatibleWith.${index}`, message: `version ${compatible} is already listed` });
    }
    seenVersions.add(compatible);
  });
  return issues;
}

// 05 §5.3: live events go only to screens, so an extension cannot subscribe to its own (ADR 0068).
function liveSubscriptionIssues(recording: Recording): Issue[] {
  const live = new Set(recording.types.filter((entry) => entry['kind'] === 'event' && entry['delivery'] === 'live').map((entry) => entry['type']));
  return recording.subscriptionEvents.flatMap((event, index) => (live.has(event)
    ? [{ path: `subscriptions.${index}.event`, message: `"${event}" is a live event; live events reach only screens`, hint: 'subscribe to a durable or transient event instead' }]
    : []));
}

// The rules of 05 §5.3 the protocol schema cannot see: public names carry the extension's namespace, each name set
// has no duplicates, and migrations cover every version step (ADR 0046).
export function registrationIssues(namespace: string, recording: Recording): Issue[] {
  const typeNames = recording.typeNames.map((type) => type.name);
  const already = () => '';
  return [
    ...publicNameIssues(namespace, typeNames, (index) => `types.${index}.type`),
    ...publicNameIssues(namespace, recording.entityNames, (index) => `entities.${index}.name`),
    ...errorCodeIssues(namespace, recording.errorCodes),
    ...duplicateIssues(typeNames, (index) => `types.${index}.type`, (first) => ` as ${kindArticles[recording.typeNames[first]?.kind ?? 'command']}`),
    ...duplicateIssues(recording.entityNames, (index) => `entities.${index}.name`, already),
    ...duplicateIssues(recording.collectionNames, (index) => `data.collections.${index}.name`, already),
    ...duplicateIssues(recording.logNames, (index) => `data.logs.${index}.prefix`, already),
    ...duplicateIssues(recording.scheduleNames, (index) => `schedules.${index}.name`, already),
    ...duplicateIssues(recording.errorCodes, (index) => `errors.${index}.code`, already),
    ...duplicateIssues(recording.subscriptionEvents, (index) => `subscriptions.${index}.event`, already),
    ...duplicateIssues(recording.capabilityNames, (index) => `permissions.capabilities.${index}.name`, already),
    ...liveSubscriptionIssues(recording),
    ...(recording.dataVersion === undefined ? [] : dataVersionIssues(recording.dataVersion)),
  ];
}
