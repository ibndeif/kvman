import { namespaceSchema, type Issue, type JsonObject } from '@kvman/protocol';
import { arrayAt, stringAt } from './json-reading.ts';
import type { DataVersion, ManifestNames } from './manifest-names.ts';

const kindArticles: Record<string, string> = { command: 'a command', query: 'a query', event: 'an event' };

export const reservedNamespaces: readonly string[] = ['kernel', 'ui', 'frame', 'sys', 'preset'];

// 02 §2.4, 06 §6.3: a namespace is lowercase kebab-case of 2–32 characters and not reserved.
function namespaceIssues(namespace: string | undefined): Issue[] {
  if (namespace === undefined) return [];
  if (!namespaceSchema.safeParse(namespace).success) {
    return [{ path: 'meta.namespace', message: `"${namespace}" is not a namespace`, hint: 'use 2–32 lowercase letters, digits, and "-", e.g. "pdf"' }];
  }
  if (!reservedNamespaces.includes(namespace)) return [];
  return [{ path: 'meta.namespace', message: `the namespace "${namespace}" is reserved`, hint: `choose another namespace; ${reservedNamespaces.slice(0, -1).join(', ')}, and ${reservedNamespaces.at(-1) ?? ''} are reserved` }];
}

function publicNameIssues(namespace: string, names: ReadonlyArray<string | undefined>, pathOf: (index: number) => string): Issue[] {
  return names.flatMap((name, index) => (name === undefined || name.startsWith(`${namespace}.`)
    ? []
    : [{ path: pathOf(index), message: `public names start with the namespace "${namespace}."`, hint: `did you mean "${namespace}.${name}"?` }]));
}

function errorCodeIssues(namespace: string, codes: ReadonlyArray<string | undefined>): Issue[] {
  return codes.flatMap((code, index) => {
    if (code === undefined || code.startsWith(`${namespace}/`)) return [];
    const bareCode = code.slice(code.indexOf('/') + 1);
    return [{ path: `errors.${index}.code`, message: `error codes start with the namespace "${namespace}/"`, hint: `did you mean "${namespace}/${bareCode}"?` }];
  });
}

function duplicateIssues(names: ReadonlyArray<string | undefined>, pathOf: (index: number) => string, describe: (firstIndex: number, index: number) => [string, string] = () => ['', 'rename one of them']): Issue[] {
  const firstIndexes = new Map<string, number>();
  return names.flatMap((name, index) => {
    if (name === undefined) return [];
    const firstIndex = firstIndexes.get(name);
    if (firstIndex === undefined) {
      firstIndexes.set(name, index);
      return [];
    }
    const [already, hint] = describe(firstIndex, index);
    return [{ path: pathOf(index), message: `"${name}" is already registered${already}`, hint }];
  });
}

function typeDuplicateIssues(names: ManifestNames): Issue[] {
  return duplicateIssues(names.types.map((type) => type.name), (index) => `types.${index}.type`, (first, index) => {
    const firstKind = names.types[first]?.kind ?? '';
    const sameKind = firstKind === names.types[index]?.kind;
    return [` as ${kindArticles[firstKind] ?? firstKind}`, sameKind ? 'rename one of them' : 'one name is never used for two kinds; rename one of them'];
  });
}

function dataVersionIssues({ version, compatibleWith, steps }: DataVersion): Issue[] {
  const hint = `register one migration for each version from 2 to ${version}`;
  const issues: Issue[] = [];
  const seenSteps = new Set<number>();
  steps.forEach((to, index) => {
    if (!Number.isInteger(to) || to < 2 || to > version) {
      issues.push({ path: `data.migrations.${index}.to`, message: `a migration goes to a version from 2 to the data version ${version}`, hint });
    } else if (seenSteps.has(to)) {
      issues.push({ path: `data.migrations.${index}.to`, message: `there is already a migration to version ${to}`, hint });
    }
    seenSteps.add(to);
  });
  for (let to = 2; to <= version; to += 1) {
    if (!seenSteps.has(to)) issues.push({ path: 'data.migrations', message: `no migration to version ${to}; each version from 2 to ${version} needs one`, hint });
  }
  const seenVersions = new Set<number>();
  compatibleWith.forEach((compatible, index) => {
    const compatibleHint = `list newer data versions than ${version} that this code still runs on, each once`;
    if (compatible <= version) {
      issues.push({ path: `data.compatibleWith.${index}`, message: `compatible versions are higher than the data version ${version}`, hint: compatibleHint });
    } else if (seenVersions.has(compatible)) {
      issues.push({ path: `data.compatibleWith.${index}`, message: `version ${compatible} is already listed`, hint: compatibleHint });
    }
    seenVersions.add(compatible);
  });
  return issues;
}

// 05 §5.3: live events go only to screens, so an extension cannot subscribe to its own (ADR 0068).
function liveSubscriptionIssues(manifest: JsonObject, names: ManifestNames): Issue[] {
  const live = new Set(arrayAt(manifest, 'types')
    .filter((entry) => stringAt(entry, 'kind') === 'event' && stringAt(entry, 'delivery') === 'live')
    .map((entry) => stringAt(entry, 'type')));
  return names.subscriptions.flatMap((event, index) => (event !== undefined && live.has(event)
    ? [{ path: `subscriptions.${index}.event`, message: `"${event}" is a live event; live events reach only screens`, hint: 'subscribe to a durable or transient event instead' }]
    : []));
}

// The name rules of 05 §5.3 and 06 §6.3 the protocol schema cannot see: the namespace is not reserved, public names
// carry it, each name set has no duplicates, and migrations cover every version step (ADR 0046).
export function nameIssues(manifest: JsonObject, names: ManifestNames): Issue[] {
  const namespace = names.namespace;
  const prefixed = namespace === undefined || !namespaceSchema.safeParse(namespace).success ? [] : [
    ...publicNameIssues(namespace, names.types.map((type) => type.name), (index) => `types.${index}.type`),
    ...publicNameIssues(namespace, names.entities, (index) => `entities.${index}.name`),
    ...errorCodeIssues(namespace, names.errors),
  ];
  return [
    ...namespaceIssues(namespace),
    ...prefixed,
    ...typeDuplicateIssues(names),
    ...duplicateIssues(names.entities, (index) => `entities.${index}.name`),
    ...duplicateIssues(names.collections, (index) => `data.collections.${index}.name`),
    ...duplicateIssues(names.logs, (index) => `data.logs.${index}.prefix`),
    ...duplicateIssues(names.schedules, (index) => `schedules.${index}.name`),
    ...duplicateIssues(names.errors, (index) => `errors.${index}.code`),
    ...duplicateIssues(names.subscriptions, (index) => `subscriptions.${index}.event`),
    ...duplicateIssues(names.capabilities, (index) => `permissions.capabilities.${index}.name`),
    ...liveSubscriptionIssues(manifest, names),
    ...(names.dataVersion === undefined ? [] : dataVersionIssues(names.dataVersion)),
  ];
}
