import { describe, expect, it } from 'vitest';
import {
  extensionGetRequestSchema, extensionGetResultSchema, extensionInstalledSchema, extensionsListRequestSchema, extensionsListResultSchema, extensionUninstalledSchema,
  installRequestSchema, installResultSchema, presetChangedSchema, stageRequestSchema, uninstallRequestSchema, uninstallResultSchema,
} from '../src/index.ts';
import pdf from './fixtures/pdf-manifest.json' with { type: 'json' };

const digest = 'd'.repeat(64);
const workspaceId = 'a'.repeat(64);
const listing = {
  name: '@acme/pdf', title: 'PDF', description: 'Translates PDFs.', version: '1.2.0', namespace: 'pdf', activeDigest: digest, status: 'quarantined',
  quarantineReason: 'EXT_INTEGRITY', isolation: { [workspaceId]: 'sandboxed' }, enabledIn: [workspaceId],
};
const grants = { isolation: 'sandboxed', requested: [], derived: { subscribes: [], providesLlm: [] } };

describe('extension lifecycle shapes (plan 03 §3.8, ADRs 0118–0120)', () => {
  it('M2.2-E49 payloads, results, and event payloads parse, and unknown fields, bad sources, and bad digests fail', () => {
    const valid: Array<[{ safeParse(value: unknown): { success: boolean } }, unknown]> = [
      [stageRequestSchema, { source: 'npm:@acme/pdf@1.2.0' }], [installRequestSchema, { confirmationToken: 't' }], [installResultSchema, { name: '@acme/pdf', digest }],
      [uninstallRequestSchema, { name: '@acme/pdf', deleteData: true, keepSnapshots: false }], [uninstallResultSchema, {}], [extensionsListRequestSchema, { workspaceId }],
      [extensionsListResultSchema, [listing]], [extensionGetRequestSchema, { name: '@acme/pdf' }],
      [extensionGetResultSchema, { versions: [{ digest, source: 'npm:@acme/pdf@1.2.0', version: '1.2.0', installedAt: 1 }], manifest: pdf, grants: { [workspaceId]: grants } }],
      [extensionInstalledSchema, { name: '@acme/pdf', digest }], [extensionUninstalledSchema, { name: '@acme/pdf' }], [presetChangedSchema, { workspaceId, revision: 2, cause: 'disable' }],
    ];
    for (const [schema, value] of valid) expect(schema.safeParse(value).success).toBe(true);
    const invalid: Array<[{ safeParse(value: unknown): { success: boolean } }, unknown]> = [
      [stageRequestSchema, { source: 'npm:@acme/pdf@^1' }], [stageRequestSchema, { source: 'npm:@acme/pdf@1.2.0', color: 'red' }],
      [installResultSchema, { name: '@acme/pdf', digest: 'short' }], [extensionsListResultSchema, [{ ...listing, status: 'broken' }]],
      [presetChangedSchema, { workspaceId, revision: 0, cause: 'disable' }],
    ];
    for (const [schema, value] of invalid) expect(schema.safeParse(value).success).toBe(false);
  });
});
