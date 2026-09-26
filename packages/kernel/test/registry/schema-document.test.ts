import { builtinComponentEntries, kernelErrorListings, kernelTypeEntries, KernelRegistry, schemaDocument, type SchemaSources } from '../../src/index.ts';
import { builtinComponentSpecs, frameSlots, kernelErrors, protocolVersion, schemaDocumentSchema, type Manifest } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { command, event, manifest, query, workspaceA } from './manifests.ts';

const objectSchema = { type: 'object', properties: {}, additionalProperties: false };
const components = builtinComponentEntries();

function registryOf(extensions: Array<{ manifest: Manifest; quarantined: boolean }>, enabled: Array<[string, string[]]>): KernelRegistry {
  const build = KernelRegistry.build({ extensions, enabled: new Map(enabled) });
  if (!build.ok) throw new Error(build.failure.detail);
  return build.registry;
}

function sources(extensions: readonly Manifest[]): SchemaSources {
  return { version: '2.0.0', kernelTypes: kernelTypeEntries(), extensions, components };
}

function names(extensions: readonly Manifest[]): string[] {
  return schemaDocument(sources(extensions), undefined).extensions.map((extension) => extension.name);
}

const files = manifest('@acme/files', 'files', { types: [command('files.add')] });
const notes = manifest('@acme/notes', 'notes', { types: [command('notes.add')] });
const broken = manifest('@acme/broken', 'broken', { types: [command('broken.run')] });

describe('the schema document (plan 12 §12.7, ADR 0111)', () => {
  it('M2.1-E29 without a workspace: the kernel and every installed extension that is not quarantined', () => {
    const registry = registryOf([{ manifest: files, quarantined: false }, { manifest: notes, quarantined: false }, { manifest: broken, quarantined: true }], [[workspaceA, ['@acme/files']]]);
    expect(names(registry.listed(undefined))).toEqual(['@acme/files', '@acme/notes']);
    const document = schemaDocument(sources(registry.listed(undefined)), undefined);
    expect(document.types.some((type) => type.owner === 'kernel')).toBe(true);
    expect(document.types.some((type) => type.owner === '@acme/broken')).toBe(false);
  });

  it('M2.1-E30 a quarantined extension enabled in the workspace is left out', () => {
    const registry = registryOf([{ manifest: files, quarantined: false }, { manifest: broken, quarantined: true }], [[workspaceA, ['@acme/files', '@acme/broken']]]);
    expect(names(registry.listed(workspaceA))).toEqual(['@acme/files']);
  });

  it('M2.1-E31 each kind of type is listed with its fields, and kernel types are global', () => {
    const rich = manifest('@acme/pdf', 'pdf', {
      types: [
        {
          type: 'pdf.translate', kind: 'command', description: 'A command.', input: objectSchema, access: 'all', handler: 'command:pdf.translate', scope: 'global',
          lane: 'file:{{ $payload.fileId }}', examples: [{ fileId: 'a' }], slash: { name: 'translate', description: 'Translate' }, agentTool: { title: 'Translate' },
        },
        query('pdf.files.list'),
        event('pdf.translated'),
        event('pdf.progress.updated', 'live'),
        { type: 'pdf.files.prune', kind: 'command', description: 'A command.', input: objectSchema, access: 'internal', handler: 'command:pdf.files.prune' },
      ],
    });
    const types = schemaDocument(sources([rich]), undefined).types;
    const byName = new Map(types.map((type) => [type.type, type]));
    expect(byName.get('pdf.translate')).toEqual({
      type: 'pdf.translate', kind: 'command', owner: '@acme/pdf', namespace: 'pdf', description: 'A command.', input: objectSchema, examples: [{ fileId: 'a' }],
      access: 'all', agentTool: { title: 'Translate' }, slash: { name: 'translate', description: 'Translate' }, lane: true, scope: 'global',
    });
    expect(byName.get('pdf.files.list')).toMatchObject({ examples: [], scope: 'workspace', output: objectSchema });
    expect(byName.get('pdf.translated')).toEqual({
      type: 'pdf.translated', kind: 'event', owner: '@acme/pdf', namespace: 'pdf', description: 'An event.', input: objectSchema, examples: [], delivery: 'durable', scope: 'workspace',
    });
    expect(byName.get('pdf.progress.updated')).toMatchObject({ chunk: 'text', delivery: 'live' });
    expect(byName.get('pdf.progress.updated')).not.toHaveProperty('input');
    expect(byName.has('pdf.files.prune')).toBe(false);
    const kernel = types.filter((type) => type.namespace === 'kernel');
    expect(kernel.length).toBeGreaterThan(0);
    for (const type of kernel) expect(type).toMatchObject({ owner: 'kernel', scope: 'global' });
  });

  it('M2.1-E32 entities and errors carry their owner, with every kernel code listed', () => {
    const display = { title: '$item.name' };
    const withEntities: Manifest = {
      ...manifest('@acme/pdf', 'pdf', {}),
      entities: [{ name: 'pdf.file', description: 'A file.', title: 'File', schema: objectSchema, idField: 'id', display }],
      errors: [{ code: 'pdf/NOT_FOUND', description: 'Missing.', title: 'No such file', retryable: false, hint: 'Check the id.' }],
    };
    const document = schemaDocument(sources([withEntities, manifest('@acme/notes', 'notes', {})]), undefined);
    expect(document.entities).toEqual([{ type: 'pdf.file', owner: '@acme/pdf', description: 'A file.', schema: objectSchema, display }]);
    expect(document.errors).toContainEqual({ code: 'pdf/NOT_FOUND', owner: '@acme/pdf', description: 'Missing.', title: 'No such file', retryable: false, hint: 'Check the id.' });
    const byCode = (left: { code: string }, right: { code: string }) => (left.code < right.code ? -1 : 1);
    expect(document.errors.filter((error) => error.owner === 'kernel')).toEqual(kernelErrorListings().sort(byCode));
    expect(kernelErrorListings().map((error) => error.code).sort()).toEqual(Object.keys(kernelErrors).sort());
    expect(kernelErrorListings()).toContainEqual({ code: 'NOT_FOUND', owner: 'kernel', description: kernelErrors.NOT_FOUND.description, title: kernelErrors.NOT_FOUND.title, retryable: false });
  });

  it('M2.1-E33 versions, components, frame slots, and the empty sections', () => {
    const plain = manifest('@acme/notes', 'notes', {});
    const document = schemaDocument(sources([plain]), undefined);
    expect(document).toMatchObject({ kernelVersion: '2.0.0', shellVersion: '2.0.0', protocolVersion, contributions: [], contracts: [], frameSlots });
    expect(document.components).toHaveLength(builtinComponentSpecs.length);
    expect(document.components.every((component) => component.owner === 'shell' && component.form === 'builtin')).toBe(true);
    expect(document.components.find((component) => component.name === 'button')).toMatchObject({ children: 'none', events: { onClick: { description: 'The control was clicked.' } }, props: { type: 'object' } });
    expect(document.extensions).toEqual([{ name: '@acme/notes', namespace: 'notes', title: '@acme/notes', description: 'The @acme/notes extension.' }]);
    expect(schemaDocumentSchema.parse(document)).toEqual(document);
  });

  it('M2.1-E34 without q, each list is sorted by name', () => {
    const document = schemaDocument(sources([notes, files]), undefined);
    const typeNames = document.types.map((type) => type.type);
    expect(typeNames).toEqual([...typeNames].sort());
    expect(document.extensions.map((extension) => extension.name)).toEqual(['@acme/files', '@acme/notes']);
    const codes = document.errors.map((error) => error.code);
    expect(codes).toEqual([...codes].sort());
  });
});
