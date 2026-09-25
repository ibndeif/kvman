import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { kv, objectOf, openHostFixture, rows, run, value, workspaceA, type HostFixture } from './harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

function ask(type: string, payload: Record<string, string> = {}): ReturnType<HostFixture['runtime']['query']> {
  return fixture.runtime.query({ sender: { address: 'user:local' }, type, payload, cause: undefined, workspaceId: workspaceA });
}

describe('queries in shared hosts (plan 02 §2.3, ADR 0074)', () => {
  it('M1.6-H2 a query answers with data and stores nothing', async () => {
    const added = objectOf(await value(fixture, 'notes.add', { text: 'hi' }));
    const before = rows(fixture, 'SELECT id FROM messages').length;
    expect(await ask('notes.list')).toEqual({ ok: true, value: { items: [{ id: added['id'], text: 'hi', tags: [] }] } });
    expect(rows(fixture, 'SELECT id FROM messages')).toHaveLength(before);
  });

  it('M1.6-H8 a query cannot write', async () => {
    expect(await ask('notes.writes.list')).toMatchObject({ ok: false, problem: { code: 'CAPABILITY_DENIED' } });
    expect(kv(fixture, '@acme/notes', 'query-write')).toBeUndefined();
  });

  it('M1.6-E12 ctx.query from a handler returns data or rejects', async () => {
    await run(fixture, 'counter.increment', { by: 3 });
    expect(await value(fixture, 'notes.count.check')).toEqual({ total: { total: 3 }, missing: 'TYPE_NOT_FOUND' });
  });

  it('M1.6-E13 a query may read and query, and nothing else', async () => {
    for (const call of ['send', 'publish', 'command', 'live', 'defer', 'reply', 'step']) {
      expect(await ask('notes.misuse.get', { call }), call).toEqual({ ok: true, value: { code: 'CAPABILITY_DENIED' } });
    }
    expect(await ask('notes.nested.get')).toEqual({ ok: true, value: { total: { total: 0 } } });
  });
});
