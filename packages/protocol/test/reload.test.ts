import { describe, expect, it } from 'vitest';
import {
  extensionReloadedSchema, extensionReloadRequestSchema, extensionReloadResultSchema, extensionRollbackRequestSchema, extensionUnquarantineRequestSchema,
  extensionUnquarantineResultSchema, extensionUnquarantinedSchema, grantsRequiredParamsSchema, hostToKernelFrameSchema, kernelToHostFrameSchema,
  migratingRecordSchema, rollbackBlockedParamsSchema, rpcCallSchema,
} from '../src/index.ts';
import { expectRoundTrip } from './assertions.ts';
import manifest from './fixtures/pdf-manifest.json' with { type: 'json' };

const digest = 'd'.repeat(64);
const workspaceId = 'a'.repeat(64);
const grants = { isolation: 'sandboxed', requested: [{ name: 'process' }], derived: { subscribes: [], providesLlm: [] } };

describe('reload, rollback, unquarantine, and migration shapes (plan 06 §6.6–§6.7, ADRs 0143, 0145)', () => {
  it('M2.7-E37 the reload, rollback, unquarantine, and migration shapes', () => {
    expectRoundTrip(extensionReloadRequestSchema, { name: '@acme/notes', digest, grants: { [workspaceId]: grants } });
    expectRoundTrip(extensionReloadRequestSchema, { name: '@acme/notes' });
    expectRoundTrip(extensionRollbackRequestSchema, { name: '@acme/notes', digest });
    expectRoundTrip(extensionReloadResultSchema, { digest });
    expectRoundTrip(extensionUnquarantineRequestSchema, { name: '@acme/notes' });
    expectRoundTrip(extensionUnquarantineResultSchema, {});
    expectRoundTrip(extensionReloadedSchema, { workspaceId, name: '@acme/notes', digest });
    expectRoundTrip(extensionUnquarantinedSchema, { name: '@acme/notes' });
    expectRoundTrip(grantsRequiredParamsSchema, { digest, workspaces: [{ workspaceId, missing: ['process'], isolation: 'shared requested, sandboxed granted' }, { workspaceId, missing: [] }] });
    expectRoundTrip(rollbackBlockedParamsSchema, { stored: 2, target: 1 });
    expectRoundTrip(migratingRecordSchema, { digest, grants: { [workspaceId]: grants } });

    expectRoundTrip(kernelToHostFrameSchema, {
      frame: 'migrate', invocationId: 'm1', extension: '@acme/notes', to: 2, deadlineAt: 1, correlationId: '01JABCDEFGHJKMNPQRSTVWXYZ0', module: { entry: '/x/notes.js', manifest },
    });
    expectRoundTrip(hostToKernelFrameSchema, {
      frame: 'migrated', invocationId: 'm1', outcome: { ok: true },
      writes: [
        { kind: 'kv.set', workspaceId: null, key: 'k', value: 1 }, { kind: 'kv.delete', workspaceId, key: 'k' },
        { kind: 'doc.put', workspaceId, collection: 'items', id: 'a', data: { id: 'a' } }, { kind: 'doc.delete', workspaceId: null, collection: 'items', id: 'b' },
        { kind: 'log.set', workspaceId, log: 'history:a', seq: 1, value: { v: 2 } }, { kind: 'log.delete', workspaceId, log: 'audit', seq: 2 },
      ],
      config: [{ scope: 'global', value: { limit: 10 } }, { scope: 'workspace', workspaceId, value: {} }],
    });
    expectRoundTrip(rpcCallSchema, { name: 'migration.rows', data: 'logs', log: 'history:*', after: ['', 'history:a', 3] });
    expectRoundTrip(rpcCallSchema, { name: 'migration.config.get', scope: 'workspace', workspaceId });

    const refused: Array<[{ safeParse(value: unknown): { success: boolean } }, unknown]> = [
      [extensionReloadRequestSchema, { name: '@acme/notes', digest: 'abc' }],
      [extensionReloadRequestSchema, { name: '@acme/notes', force: true }],
      [extensionReloadRequestSchema, { name: '@acme/notes', grants: { 'not-a-workspace': grants } }],
      [extensionRollbackRequestSchema, { name: '@acme/notes' }],
      [rollbackBlockedParamsSchema, { stored: 0, target: 1 }],
      [rpcCallSchema, { name: 'migration.rows', data: 'blobs' }],
    ];
    for (const [schema, value] of refused) expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false);
  });
});
