import { describe, expect, it } from 'vitest';
import {
  messagesListRequestSchema, messagesListResultSchema, rpcCallSchema, subscribersListRequestSchema, subscribersListResultSchema,
} from '../src/index.ts';
import { expectRoundTrip } from './assertions.ts';

const workspaceId = 'a'.repeat(64);
const id = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';

type Parser = { safeParse(value: unknown): { success: boolean } };

describe('store reads and the M2.4 kernel queries (plan 03 §3.5, §3.8, ADRs 0131–0133)', () => {
  it('M2.4-E31 the new call and query shapes are strict', () => {
    const read = { name: 'store.read', read: { op: 'doc.find', scope: 'workspace', collection: 'items', where: { group: 'x' }, orderBy: [['id', 'asc']], limit: 5 } };
    expectRoundTrip(rpcCallSchema, read);
    expectRoundTrip(rpcCallSchema, { name: 'store.read', read: { op: 'log.read', scope: 'global', log: 'trail', after: 0, before: 9, maxRows: 10 } });
    expectRoundTrip(messagesListRequestSchema, { state: 'done', type: 'probe.work', extension: '@acme/probe', workspaceId, correlationId: id, limit: 1000 });
    expectRoundTrip(messagesListResultSchema, {
      items: [{
        id, kind: 'command', type: 'probe.work', state: 'done', source: 'user:local', handler: '@acme/probe', workspaceId, lane: 'file:1',
        priority: 'interactive', attempts: 0, correlationId: id, createdAt: 1, updatedAt: 2,
      }],
      total: 1,
    });
    expectRoundTrip(subscribersListRequestSchema, { workspaceId, type: 'probe.worked' });
    expectRoundTrip(subscribersListResultSchema, [{ name: '@acme/listener', namespace: 'listener', title: 'Listener', status: 'active', calls: ['probe.*'] }]);
    const invalid: Array<[Parser, unknown]> = [
      [rpcCallSchema, { ...read, read: { ...read.read, owner: '@acme/other' } }],
      [rpcCallSchema, { ...read, read: { ...read.read, ws: workspaceId } }],
      [rpcCallSchema, { name: 'store.read', read: { op: 'kv.drop', scope: 'global', key: 'k' } }],
      [messagesListRequestSchema, { limit: 1001 }],
      [messagesListRequestSchema, { limit: 0 }],
      [messagesListResultSchema, { items: [{ id, payload: {} }], total: 1 }],
      [subscribersListRequestSchema, { workspaceId, type: 'probe.*' }],
    ];
    for (const [schema, value] of invalid) expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false);
  });
});
