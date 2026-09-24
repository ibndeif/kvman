import { describe, expect, it } from 'vitest';
import { commitWrites, handlerStore, openStoreFixture, seedDocuments } from './harness.ts';

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('caps and sizes (plan 04 §4.3, ADR 0039)', () => {
  it('M1.2-H5 a find over the cap fails instead of truncating', async () => {
    const fixture = openStoreFixture();
    await seedDocuments(fixture, 'files', Array.from({ length: 5001 }, (_, index) => ({ id: `f${index}`, status: 'ready', createdAt: index })));
    const files = handlerStore(fixture).store.collection('files');
    expect(await rejection(files.find({ where: { status: 'ready' } }))).toMatchObject({ problem: { code: 'STORE_RESULT_TOO_LARGE', hint: 'add a filter or a limit' } });
    expect(await files.find({ where: { status: 'ready' }, limit: 50 })).toHaveLength(50);
  });

  it('M1.2-E15 kv.set of a value over 1 MB throws at the call', () => {
    const fixture = openStoreFixture();
    const { store } = handlerStore(fixture);
    expect(() => store.kv.set('big', 'x'.repeat(1024 * 1024))).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE', params: { limit: 'kv-value', max: 1_048_576 } }) }));
  });

  it('M1.2-E16 finds over 16 MB and lists and reads over 5,000 entries fail', async () => {
    const fixture = openStoreFixture();
    for (let batch = 0; batch < 6; batch += 1) {
      await seedDocuments(fixture, 'files', Array.from({ length: 3 }, (_, index) => ({ id: `big${batch}-${index}`, status: 'ready', createdAt: index, body: 'x'.repeat(1024 * 1024) })));
    }
    const { store } = handlerStore(fixture);
    expect(await rejection(store.collection('files').find({ where: { status: 'ready' } }))).toMatchObject({ problem: { code: 'STORE_RESULT_TOO_LARGE' } });
    await commitWrites(fixture, Array.from({ length: 5001 }, (_, index) => ({ kind: 'kv.set' as const, scope: 'workspace' as const, key: `k:${index}`, value: index })));
    expect(await rejection(store.kv.list('k:'))).toMatchObject({ problem: { code: 'STORE_RESULT_TOO_LARGE' } });
    await commitWrites(fixture, Array.from({ length: 5001 }, (_, index) => ({ kind: 'log.append' as const, scope: 'workspace' as const, log: 'audit', seq: index + 1, value: index })));
    expect(await rejection(store.log('audit').read())).toMatchObject({ problem: { code: 'STORE_RESULT_TOO_LARGE' } });
  });
});
