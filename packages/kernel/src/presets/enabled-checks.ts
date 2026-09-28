import { jsonObjectSchema, type Issue, type Json, type JsonObject, type Manifest } from '@kvman/protocol';
import { ConfigChecker, mergedConfig } from '../config/config-values.ts';
import { kernelTypeEntries } from '../registry/kernel-types.ts';
import { PayloadValidators } from '../router/payload-validators.ts';
import type { Connection } from '../storage/driver.ts';
import { readConfigRow } from '../storage/config-rows.ts';

const kernelTypes = new Set(kernelTypeEntries().map((entry) => entry.type));
const checker = new ConfigChecker(new PayloadValidators());

function asObject(value: unknown): JsonObject | undefined {
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function requiredTypes(manifest: Manifest): string[] {
  return manifest.permissions.requireTypes.flatMap((requirement) => requirement.types);
}

// Every pair of the enabled set sharing a namespace, in enable order (06 §6.3).
export type NamespaceClash = { first: string; second: string; namespace: string };

export function namespaceClashes(manifests: readonly Manifest[]): NamespaceClash[] {
  const clashes: NamespaceClash[] = [];
  for (let left = 0; left < manifests.length; left += 1) {
    for (let right = left + 1; right < manifests.length; right += 1) {
      const first = manifests[left];
      const second = manifests[right];
      if (first === undefined || second === undefined) continue;
      const namespace = first.meta.namespace;
      if (namespace !== second.meta.namespace) continue;
      clashes.push({ first: first.meta.name, second: second.meta.name, namespace });
    }
  }
  return clashes;
}

// A namespace clash is reported at the second extension, naming both extensions and the namespace.
export function namespaceIssues(manifests: readonly Manifest[]): Issue[] {
  return namespaceClashes(manifests).map(({ first, second, namespace }) => ({
    path: `extensions.${second}`,
    message: `${first} and ${second} both use the namespace "${namespace}"`,
  }));
}

// Every pair of the enabled set sharing a provider id, in enable order (ADR 0152).
export type ProviderClash = { first: string; second: string; provider: string };

export function providerClashes(manifests: readonly Manifest[]): ProviderClash[] {
  const clashes: ProviderClash[] = [];
  const owners = new Map<string, string>();
  for (const manifest of manifests) {
    for (const provider of manifest.llm.providers) {
      const first = owners.get(provider.id);
      if (first !== undefined) clashes.push({ first, second: manifest.meta.name, provider: provider.id });
      else owners.set(provider.id, manifest.meta.name);
    }
  }
  return clashes;
}

// A provider clash is reported at the second extension, naming both extensions and the provider.
export function providerIssues(manifests: readonly Manifest[]): Issue[] {
  return providerClashes(manifests).map(({ first, second, provider }) => ({
    path: `extensions.${second}`,
    message: `${first} and ${second} both provide "${provider}"`,
  }));
}

// Every required type no enabled manifest provides (and the kernel does not), in enable order (06 §6.3).
export type MissingRequirement = { name: string; type: string };

export function missingRequirements(manifests: readonly Manifest[]): MissingRequirement[] {
  const provided = new Set(manifests.flatMap((manifest) => manifest.types.map((entry) => entry.type)));
  return manifests.flatMap((manifest) => requiredTypes(manifest)
    .filter((type) => !provided.has(type) && !kernelTypes.has(type))
    .map((type) => ({ name: manifest.meta.name, type })));
}

// A missing type is reported at the extension that requires it.
export function requiresIssues(manifests: readonly Manifest[]): Issue[] {
  return missingRequirements(manifests).map(({ name, type }) => ({
    path: `extensions.${name}`,
    message: `${type} is not provided`,
  }));
}

export type ConfigCheckInput = {
  connection: Connection;
  workspaceId: string;
  enabled: readonly Manifest[];
  entries: ReadonlyMap<string, Manifest | undefined>;
  config: Record<string, Json> | undefined;
};

// One config finding, in the order the apply checks report them: each enabled extension's layer first, then every
// config section naming an extension that is not enabled with it (06 §6.3, 07 §7.4).
export type ConfigFinding =
  | { kind: 'not-object'; name: string }
  | { kind: 'field'; name: string; issue: Issue }
  | { kind: 'not-part'; name: string }
  | { kind: 'no-config'; name: string };

export function configFindingIssue(finding: ConfigFinding): Issue {
  switch (finding.kind) {
    case 'not-object': return { path: `config.${finding.name}`, message: 'a config value is an object of fields' };
    case 'field': return finding.issue;
    case 'not-part': return { path: `config.${finding.name}`, message: `${finding.name} is not part of the preset` };
    case 'no-config': return { path: `config.${finding.name}`, message: `${finding.name} has no config` };
  }
}

// Check 4c: the merged value (defaults, the global row, then the preset's config or the workspace's row) of every
// enabled extension with a config schema, and every config key naming an entry with a schema.
export function configFindings(input: ConfigCheckInput): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  const sections = input.config ?? {};
  for (const manifest of input.enabled) {
    const name = manifest.meta.name;
    const candidate = sections[name];
    const layer = candidate === undefined ? readConfigRow(input.connection, name, input.workspaceId).value : asObject(candidate);
    if (layer === undefined) {
      findings.push({ kind: 'not-object', name });
      continue;
    }
    const schema = manifest.config?.schema;
    if (schema === undefined) continue;
    const global = readConfigRow(input.connection, name, undefined).value;
    for (const issue of checker.issues(schema, mergedConfig(schema, global, layer))) {
      findings.push({ kind: 'field', name, issue: { ...issue, path: issue.path === '' ? `config.${name}` : `config.${name}.${issue.path}` } });
    }
  }
  for (const name of Object.keys(sections).sort()) {
    if (!input.entries.has(name)) findings.push({ kind: 'not-part', name });
    else if (input.entries.get(name)?.config === null) findings.push({ kind: 'no-config', name });
  }
  return findings;
}

export function configIssues(input: ConfigCheckInput): Issue[] {
  return configFindings(input).map(configFindingIssue);
}
