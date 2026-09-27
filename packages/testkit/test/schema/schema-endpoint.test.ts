import { schemaDocumentSchema, type SchemaDocument } from '@kvman/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { problemOf, send } from '../adapters/http-client.ts';
import { workerTests, workspaceA, workspaceB } from '../hosts/harness.ts';
import { bootSchemaFixture, unknownWorkspace, type SchemaFixture } from './harness.ts';

let fixture: SchemaFixture;
beforeEach(async () => {
  fixture = await bootSchemaFixture();
});
afterEach(async () => {
  await fixture.close();
});

async function schemaAt(query: string): Promise<SchemaDocument> {
  const answer = await send(fixture.port, 'GET', `/api/v1/schema${query}`);
  expect(answer.status).toBe(200);
  return schemaDocumentSchema.parse(answer.json);
}

function ownersOf(document: SchemaDocument): string[] {
  return [...new Set(document.types.map((type) => type.owner))].sort();
}

describe('the schema endpoint (plan 12 §12.7, ADRs 0111, 0112)', workerTests, () => {
  it('M2.1-H2 /schema omits internal types and filters by workspace', async () => {
    const inA = await schemaAt(`?workspaceId=${workspaceA}`);
    expect(ownersOf(inA)).toEqual(['@acme/files', 'kernel']);
    expect(inA.types.filter((type) => type.owner === '@acme/files').map((type) => type.type)).toEqual(['files.add']);
    expect(inA.extensions.map((extension) => extension.name)).toEqual(['@acme/files']);
    const inB = await schemaAt(`?workspaceId=${workspaceB}`);
    expect(ownersOf(inB)).toEqual(['@acme/notes', 'kernel']);
    for (const document of [inA, inB]) expect(document.types.some((type) => type.type === 'files.prune')).toBe(false);
  });

  it('M2.1-E39 without a workspace: every installed extension that is not quarantined, as the query answers it', async () => {
    const document = await schemaAt('');
    expect(ownersOf(document)).toEqual(['@acme/files', '@acme/idle', '@acme/notes', 'kernel']);
    const query = await send(fixture.port, 'POST', '/api/v1/queries/kernel.schema.get', { body: { payload: {} } });
    expect(query.status).toBe(200);
    expect(query.json).toEqual({ data: document });
  });

  it('M2.1-E40 an unknown workspace is refused with WORKSPACE_INVALID', async () => {
    const answer = await send(fixture.port, 'GET', `/api/v1/schema?workspaceId=${unknownWorkspace}`);
    expect([answer.status, problemOf(answer).code, problemOf(answer).detail]).toEqual([422, 'WORKSPACE_INVALID', `no workspace ${unknownWorkspace} exists`]);
  });

  it('M2.1-E41 a blank q, a malformed workspace id, and an unknown parameter are refused', async () => {
    for (const query of ['?q=%20', '?workspaceId=nope', '?color=red']) {
      const answer = await send(fixture.port, 'GET', `/api/v1/schema${query}`);
      expect([answer.status, problemOf(answer).code]).toEqual([400, 'VALIDATION_FAILED']);
    }
  });

  it('M2.1-E42 q keeps only matching entries, ranked', async () => {
    const document = await schemaAt('?q=add');
    expect(document.types.map((type) => type.type)).toEqual(['files.add', 'notes.add', 'kernel.preset.import']);
    expect(document.extensions).toEqual([]);
    expect(document.errors.every((error) => `${error.code} ${error.description}`.toLowerCase().includes('add'))).toBe(true);
  });
});
