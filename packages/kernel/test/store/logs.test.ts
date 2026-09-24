import { describe, expect, it } from 'vitest';
import { commit, commitWrites, handlerStore, openStoreFixture } from './harness.ts';

async function seedLog(fixture: ReturnType<typeof openStoreFixture>, count: number): Promise<void> {
  await commitWrites(fixture, Array.from({ length: count }, (_, index) => ({ kind: 'log.append' as const, scope: 'workspace' as const, log: 'history:s1', seq: index + 1, value: index + 1 })));
}

describe('logs (plan 04 §4.3)', () => {
  it('M1.2-H4 two appends in one unit get consecutive seqs', async () => {
    const fixture = openStoreFixture();
    await seedLog(fixture, 4);
    const handler = handlerStore(fixture);
    const history = handler.store.log('history:s1');
    expect([await history.append('five'), await history.append('six')]).toEqual([5, 6]);
    expect(await commit(fixture, handler)).toMatchObject({ committed: true });
    expect(fixture.reader.logRead('@acme/pdf', 'a'.repeat(64), 'history:s1', 4, 100, 10)).toEqual([{ seq: 5, value: 'five' }, { seq: 6, value: 'six' }]);
  });

  it('M1.2-E14 ranges, last, and pending truncation and drop', async () => {
    const fixture = openStoreFixture();
    await seedLog(fixture, 10);
    const history = handlerStore(fixture).store.log('history:s1');
    const seqs = async (range: Parameters<typeof history.read>[0]) => (await history.read(range)).map((entry) => entry.seq);
    expect(await seqs({ after: 7 })).toEqual([8, 9, 10]);
    expect(await seqs({ before: 3 })).toEqual([1, 2]);
    expect(await seqs({ after: 3, before: 6 })).toEqual([4, 5]);
    expect(await seqs({ last: 2 })).toEqual([9, 10]);
    expect(await seqs({ before: 6, last: 2 })).toEqual([4, 5]);
    expect(await history.last()).toEqual({ seq: 10, value: 10 });
    const pending = handlerStore(fixture).store.log('history:s1');
    pending.truncateBefore(9);
    expect((await pending.read()).map((entry) => entry.seq)).toEqual([9, 10]);
    pending.drop();
    expect(await pending.read()).toEqual([]);
    expect(await pending.append('fresh')).toBe(11);
    expect(await pending.read()).toEqual([{ seq: 11, value: 'fresh' }]);
  });
  it('M1.3-E15 a log family reference takes a key; a plain log does not', async () => {
    const fixture = openStoreFixture();
    const handler = handlerStore(fixture);
    expect(await handler.store.log('history:*', 'abc').append('first')).toBe(1);
    expect(handler.writes()).toEqual([{ kind: 'log.append', scope: 'workspace', log: 'history:abc', seq: 1, value: 'first' }]);
    expect(() => handler.store.log('audit', 'x')).toThrow(expect.objectContaining({
      problem: expect.objectContaining({ code: 'VALIDATION_FAILED', hint: 'only a log family such as "history:*" takes a key' }),
    }));
  });
});
