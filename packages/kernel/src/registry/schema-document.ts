import { frameSlots, kernelErrors, protocolVersion, type Manifest, type SchemaDocument, type TypeEntry } from '@kvman/protocol';
import type { ComponentEntry } from './schema-components.ts';
import { kernelOwner } from './kernel-types.ts';
import { searchEntries } from './schema-search.ts';

type TypeListing = SchemaDocument['types'][number];

type ErrorListing = SchemaDocument['errors'][number];

// What the document is built from (ADR 0111): the kvman version, the kernel's types, the listed extensions'
// manifests, and the built-in components.
export type SchemaSources = {
  version: string;
  kernelTypes: readonly TypeEntry[];
  extensions: readonly Manifest[];
  components: readonly ComponentEntry[];
};

type Owner = { name: string; namespace: string; kernel: boolean };

// Internal types are never listed (02 §2.4); kernel types need no workspace, so their scope is global (ADR 0099).
function typeListing(entry: TypeEntry, owner: Owner): TypeListing[] {
  const base = { type: entry.type, kind: entry.kind, owner: owner.name, namespace: owner.namespace, description: entry.description };
  if (entry.kind === 'event') {
    return [{
      ...base, examples: [], delivery: entry.delivery, scope: owner.kernel ? 'global' : 'workspace',
      ...(entry.payload === undefined ? {} : { input: entry.payload }), ...(entry.chunk === undefined ? {} : { chunk: entry.chunk }),
    }];
  }
  if (entry.access === 'internal') return [];
  const shared = {
    ...base, input: entry.input, examples: entry.examples ?? [], access: entry.access,
    ...(entry.output === undefined ? {} : { output: entry.output }), ...(entry.agentTool === undefined ? {} : { agentTool: entry.agentTool }),
  };
  if (entry.kind === 'query') return [{ ...shared, scope: owner.kernel ? 'global' : 'workspace' }];
  return [{
    ...shared, scope: owner.kernel ? 'global' : (entry.scope ?? 'workspace'),
    ...(entry.slash === undefined ? {} : { slash: entry.slash }), ...(entry.lane === undefined ? {} : { lane: true }),
  }];
}

function ownerOf(manifest: Manifest): Owner {
  return { name: manifest.meta.name, namespace: manifest.meta.namespace, kernel: false };
}

export function kernelErrorListings(): ErrorListing[] {
  return Object.entries(kernelErrors).map(([code, definition]) => ({
    code, owner: kernelOwner, description: definition.description, title: definition.title, retryable: definition.retryable,
  }));
}

function extensionListing(manifest: Manifest): SchemaDocument['extensions'][number] {
  const { name, namespace, title, description, icon } = manifest.meta;
  return {
    name, namespace, title, description, ...(icon === undefined ? {} : { icon }),
    ...(manifest.meta.implements.length === 0 ? {} : { implements: manifest.meta.implements }),
  };
}

// 12 §12.7, ADRs 0111 and 0112: the reference of the kernel and the listed extensions, searched by `q`.
export function schemaDocument(sources: SchemaSources, q: string | undefined): SchemaDocument {
  const kernel: Owner = { name: kernelOwner, namespace: kernelOwner, kernel: true };
  const types = [
    ...sources.kernelTypes.flatMap((entry) => typeListing(entry, kernel)),
    ...sources.extensions.flatMap((manifest) => manifest.types.flatMap((entry) => typeListing(entry, ownerOf(manifest)))),
  ];
  const entities = sources.extensions.flatMap((manifest) => manifest.entities.map((entity) => ({
    type: entity.name, owner: manifest.meta.name, description: entity.description, schema: entity.schema, display: entity.display,
  })));
  const errors = [
    ...kernelErrorListings(),
    ...sources.extensions.flatMap((manifest) => manifest.errors.map((error) => ({ ...error, owner: manifest.meta.name }))),
  ];
  return {
    kernelVersion: sources.version,
    shellVersion: sources.version,
    protocolVersion,
    extensions: searchEntries(sources.extensions.map(extensionListing), q, (entry) => ({ name: entry.name, description: entry.description })),
    types: searchEntries(types, q, (entry) => ({ name: entry.type, description: entry.description })),
    entities: searchEntries(entities, q, (entry) => ({ name: entry.type, description: entry.description })),
    errors: searchEntries(errors, q, (entry) => ({ name: entry.code, description: entry.description })),
    contributions: [],
    components: [...sources.components],
    contracts: [],
    frameSlots: [...frameSlots],
  };
}
