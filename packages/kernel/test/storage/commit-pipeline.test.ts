import type { Message, StoreWrite } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import type { CommitUnit, InvocationOutcome } from '../../src/index.ts';
import { adapterUnit, invocationMessage, openTestStore, rows, type TestStore } from './harness.ts';

const extension = '@acme/pdf';
const owners = { 'pdf.translate': extension, 'pdf.import': extension };

function unitOf(message: Message, writes: StoreWrite[], outcome: InvocationOutcome = { ok: true, value: null }): CommitUnit {
  return { origin: { kind: 'invocation', invocation: { message, extension, outcome } }, writes, sends: [] };
}

const fullUnitWrites: StoreWrite[] = [
  { kind: 'kv.set', scope: 'workspace', key: 'turn', value: { status: 'running' } },
  { kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'f1', data: { status: 'ready' } },
  { kind: 'log.append', scope: 'workspace', log: 'history:s1', seq: 1, value: 'entry' },
  { kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'f2', data: { status: 'ready' } },
];

function storedCounts(store: TestStore): Record<string, number> {
  return Object.fromEntries(['kv', 'docs', 'logs'].map((table) => [table, Number(rows(store.connection, `SELECT count(*) AS n FROM ${table}`)[0]?.['n'])]));
}

describe('commit pipeline (plan 04 §4.2)', () => {
  it('M1.1-H1 a unit is applied completely or not at all', async () => {
    const store = openTestStore(owners);
    const message = await invocationMessage(store);
    const unit: CommitUnit = { ...unitOf(message, fullUnitWrites), sends: [{ type: 'pdf.import', payload: {} }] };
    store.driver.faults.push({ sql: /^INSERT INTO logs/, kind: 'other', armed: true });
    expect(await store.pipeline.enqueue(unit)).toMatchObject({ committed: false, problem: { code: 'STORAGE_UNAVAILABLE', retryable: true } });
    expect(storedCounts(store)).toEqual({ kv: 0, docs: 0, logs: 0 });
    expect(rows(store.connection, "SELECT count(*) AS n FROM messages WHERE type = 'pdf.import'")).toEqual([{ n: 0 }]);
    store.driver.faults.length = 0;
    expect(await store.pipeline.enqueue(unit)).toMatchObject({ committed: true });
    expect(storedCounts(store)).toEqual({ kv: 1, docs: 2, logs: 1 });
  });

  it('M1.1-H2 a conflicting version rolls back only that unit', async () => {
    const store = openTestStore(owners);
    const message = await invocationMessage(store);
    await store.pipeline.enqueue(unitOf(message, [{ kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'shared', data: { n: 1 } }]));
    const [first, second, third] = await Promise.all([
      store.pipeline.enqueue(unitOf(message, [{ kind: 'kv.set', scope: 'workspace', key: 'first', value: 1 }])),
      store.pipeline.enqueue(unitOf(message, [
        { kind: 'kv.set', scope: 'workspace', key: 'second', value: 1 },
        { kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'shared', data: { n: 9 }, expectedVersion: 5 },
      ])),
      store.pipeline.enqueue(unitOf(message, [{ kind: 'kv.set', scope: 'workspace', key: 'third', value: 1 }])),
    ]);
    expect([first?.committed, second, third?.committed]).toEqual([true, expect.objectContaining({ committed: false, problem: expect.objectContaining({ code: 'STORAGE_CONFLICT' }) }), true]);
    expect(rows(store.connection, 'SELECT key FROM kv ORDER BY key')).toEqual([{ key: 'first' }, { key: 'third' }]);
  });

  it('M1.1-H3 batching commits many units in one transaction', async () => {
    const store = openTestStore(owners);
    const message = await invocationMessage(store);
    const units = (count: number) => Array.from({ length: count }, (_, index) => unitOf(message, [{ kind: 'kv.set', scope: 'workspace', key: `k${count}-${index}`, value: index }]));
    const measure = async (count: number): Promise<number> => {
      const before = store.driver.transactions;
      await Promise.all(units(count).map((unit) => store.pipeline.enqueue(unit)));
      return store.driver.transactions - before;
    };
    expect(await measure(64)).toBe(1);
    expect(await measure(65)).toBe(2);
    const before = store.driver.transactions;
    const pending = units(3).map((unit) => store.pipeline.enqueue(unit));
    expect(store.driver.transactions).toBe(before);
    await Promise.all(pending);
    expect(store.driver.transactions - before).toBe(1);
  });

  it('M1.1-E12 the invocation message ends done, failed, or awaiting', async () => {
    const store = openTestStore(owners);
    const problem = { code: 'pdf/NOT_FOUND', title: 'No such file', retryable: false, correlationId: 'x' };
    const outcomes: InvocationOutcome[] = [{ ok: true, value: { blobId: 'b' } }, { ok: false, problem }, { deferred: true }];
    const expected = [
      { state: 'done', result: JSON.stringify({ ok: true, value: { blobId: 'b' } }) },
      { state: 'failed', result: JSON.stringify({ ok: false, problem }) },
      { state: 'awaiting', result: null },
    ];
    for (const [index, outcome] of outcomes.entries()) {
      const message = await invocationMessage(store);
      await store.pipeline.enqueue(unitOf(message, [], outcome));
      expect(rows(store.connection, 'SELECT state, result FROM messages WHERE id = ?', message.id)).toEqual([expected[index]]);
    }
  });

  it('M1.1-E13 units over their limits are rejected with PAYLOAD_TOO_LARGE', async () => {
    const store = openTestStore(owners);
    const message = await invocationMessage(store);
    const manySends = { ...unitOf(message, []), sends: Array.from({ length: 1001 }, () => ({ type: 'pdf.import', payload: {} })) };
    expect(await store.pipeline.enqueue(manySends)).toMatchObject({ committed: false, problem: { code: 'PAYLOAD_TOO_LARGE', params: { limit: 'messages', max: 1000 } } });
    const bigWrites = unitOf(message, Array.from({ length: 9 }, (_, index) => ({ kind: 'kv.set', scope: 'workspace', key: `big${index}`, value: 'x'.repeat(1024 * 1024) }) as StoreWrite));
    expect(await store.pipeline.enqueue(bigWrites)).toMatchObject({ committed: false, problem: { code: 'PAYLOAD_TOO_LARGE', params: { limit: 'writes', max: 8_388_608 } } });
    expect(rows(store.connection, "SELECT count(*) AS n FROM messages WHERE type = 'pdf.import'")).toEqual([{ n: 0 }]);
    expect(storedCounts(store).kv).toBe(0);
  });

  it('M1.1-E14 a failed COMMIT fails every unit of the batch', async () => {
    const store = openTestStore(owners);
    const message = await invocationMessage(store);
    store.driver.faults.push({ sql: /^COMMIT/, kind: 'other', armed: true });
    const results = await Promise.all([1, 2].map((index) => store.pipeline.enqueue(unitOf(message, [{ kind: 'kv.set', scope: 'workspace', key: `k${index}`, value: index }]))));
    expect(results).toEqual([1, 2].map(() => expect.objectContaining({ committed: false, problem: expect.objectContaining({ code: 'STORAGE_UNAVAILABLE' }) })));
    expect(storedCounts(store).kv).toBe(0);
  });

  it('M1.1-E15 a full disk fails the unit with STORAGE_FULL', async () => {
    const store = openTestStore(owners);
    const message = await invocationMessage(store);
    store.driver.faults.push({ sql: /^INSERT INTO kv/, kind: 'full', armed: true });
    expect(await store.pipeline.enqueue(unitOf(message, [{ kind: 'kv.set', scope: 'workspace', key: 'k', value: 1 }])))
      .toMatchObject({ committed: false, problem: { code: 'STORAGE_FULL', retryable: false } });
  });

  it('M1.1-E16 adapter messages are stored pending with priority codes and extension lanes', async () => {
    const store = openTestStore(owners);
    const result = await store.pipeline.enqueue(adapterUnit([
      { type: 'pdf.translate', payload: {}, priority: 'interactive', lane: 'file:f1' },
      { type: 'pdf.translate', payload: {}, priority: 'normal' },
      { type: 'pdf.translate', payload: {}, priority: 'background' },
    ]));
    expect(result.committed).toBe(true);
    expect(rows(store.connection, 'SELECT state, priority, lane FROM messages ORDER BY seq')).toEqual([
      { state: 'pending', priority: 0, lane: `${extension}|file:f1` },
      { state: 'pending', priority: 1, lane: null },
      { state: 'pending', priority: 2, lane: null },
    ]);
  });

  it('M1.1-E17 a committed unit lists the rows it inserted', async () => {
    const store = openTestStore(owners);
    const result = await store.pipeline.enqueue(adapterUnit([{ type: 'pdf.translate', payload: {} }, { type: 'pdf.import', payload: {} }]));
    expect(result.committed && result.inserted.map((stored) => [stored.message.type, stored.state, stored.seq])).toEqual([['pdf.translate', 'pending', 1], ['pdf.import', 'pending', 2]]);
  });
});
