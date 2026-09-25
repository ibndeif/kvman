import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { kv, objectOf, openHostFixture, replyOf, row, rows, run, send, value, type HostFixture, workerTests } from './harness.ts';

let fixture: HostFixture;
beforeEach(async () => {
  fixture = await openHostFixture();
});
afterEach(() => fixture.close());

describe('commands in shared hosts (plan 02 §2.3, 03 §3.5)', workerTests, () => {
  it('M1.6-H1 a command runs in a shared worker and its reply is stored', async () => {
    const id = await send(fixture, 'notes.add', { text: 'hi' });
    const reply = await fixture.runtime.awaitReply(id);
    expect(reply).toMatchObject({ ok: true, value: { id: expect.any(String) } });
    expect(row(fixture, id)).toMatchObject({ state: 'done', attempts: 0 });
    expect(replyOf(fixture, id)).toEqual(reply);
    expect(fixture.runtime.hosts.workers()).toHaveLength(1);
    const noteId = reply.ok ? objectOf(reply.value)['id'] : undefined;
    expect(rows(fixture, 'SELECT id, data FROM docs WHERE owner = ?', '@acme/notes')).toEqual([{ id: noteId, data: JSON.stringify({ id: noteId, text: 'hi', tags: [] }) }]);
  });

  it('M1.6-E1 the input is parsed with the full Zod schema in the host', async () => {
    const refused = await send(fixture, 'notes.add', { text: 'forbidden' });
    expect(await fixture.runtime.awaitReply(refused)).toMatchObject({ ok: false, problem: { code: 'VALIDATION_FAILED', retryable: false } });
    expect(row(fixture, refused)).toMatchObject({ state: 'failed', attempts: 0 });
    const accepted = objectOf(await value(fixture, 'notes.add', { text: 'ok' }));
    const stored = rows(fixture, "SELECT data FROM docs WHERE owner = '@acme/notes' AND id = ?", String(accepted['id']));
    expect(stored.map((document) => JSON.parse(String(document['data'])))).toEqual([{ id: accepted['id'], text: 'ok', tags: [] }]);
  });

  it('M1.6-E2 a result that fails its output schema fails the message and stores nothing', async () => {
    const id = await send(fixture, 'notes.broken');
    expect(await fixture.runtime.awaitReply(id)).toMatchObject({ ok: false, problem: { code: 'VALIDATION_FAILED', retryable: false } });
    expect(row(fixture, id)).toMatchObject({ state: 'failed' });
    expect(rows(fixture, "SELECT id FROM docs WHERE id = 'broken'")).toEqual([]);
  });

  it('M1.6-E15 a refused send rolls the unit back and fails the message', async () => {
    const reply = await run(fixture, 'notes.unknown.send');
    expect(reply).toMatchObject({ ok: false, problem: { code: 'TYPE_NOT_FOUND' } });
    expect(rows(fixture, "SELECT id FROM docs WHERE id = 'unsent'")).toEqual([]);
    expect(kv(fixture, '@acme/notes', 'unused')).toBeUndefined();
  });
});
