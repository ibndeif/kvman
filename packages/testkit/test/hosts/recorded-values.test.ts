import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, openHostFixture, pendingWithAttempts, row, rows, send, type HostFixture, workerTests } from './harness.ts';

let fixture: HostFixture;
beforeEach(async () => {
  fixture = await openHostFixture();
});
afterEach(() => fixture.close());

function recorded(messageId: string): Array<Record<string, unknown>> {
  return rows(fixture, 'SELECT kind, n, value FROM recorded_values WHERE message_id = ? ORDER BY kind, n', messageId);
}

describe('recorded ids, times, and steps (plan 05 §5.4, ADR 0070)', workerTests, () => {
  it('M1.6-H9 ctx.ids.new() and ctx.now() repeat on redelivery', async () => {
    const id = await send(fixture, 'notes.stamp');
    await pendingWithAttempts(fixture, id, 1);
    fixture.timers.advance(1_000);
    const reply = await fixture.runtime.awaitReply(id);
    if (!reply.ok) throw new Error(reply.problem.code);
    const stored = recorded(id);
    expect(stored.map((entry) => [entry['kind'], entry['n']])).toEqual([['id', 1], ['id', 2], ['now', 1], ['now', 2]]);
    expect(reply.value).toEqual({
      ids: stored.filter((entry) => entry['kind'] === 'id').map((entry) => entry['value']),
      times: stored.filter((entry) => entry['kind'] === 'now').map((entry) => Number(entry['value'])),
    });
  });

  it('M1.6-E26 a step runs its effect once, and a step begun but never ended is indeterminate', async () => {
    const fetch = await send(fixture, 'notes.fetch');
    await pendingWithAttempts(fixture, fetch, 1);
    fixture.timers.advance(1_000);
    expect(await fixture.runtime.awaitReply(fetch)).toEqual({ ok: true, value: { result: { body: 'fetched' }, runs: 1 } });

    const hang = await send(fixture, 'notes.fetch.hang');
    await pendingWithAttempts(fixture, hang, 1);
    fixture.timers.advance(1_000);
    expect(await fixture.runtime.awaitReply(hang)).toMatchObject({ ok: false, problem: { code: 'EFFECT_INDETERMINATE', params: { step: 'hang' } } });
  });

  it('M1.6-E27 values are stored with the first journaled write that follows them', async () => {
    const order = await send(fixture, 'notes.values.order');
    await pendingWithAttempts(fixture, order, 1);
    expect(recorded(order).map((entry) => [entry['kind'], entry['n']])).toEqual([['id', 1]]);

    const call = await send(fixture, 'notes.values.call');
    await eventually(() => expect(rows(fixture, "SELECT state FROM messages WHERE type = 'counter.wait'")).toEqual([{ state: 'awaiting' }]));
    expect(row(fixture, call)['state']).toBe('running');
    expect(recorded(call).map((entry) => [entry['kind'], entry['n']])).toEqual([['now', 1]]);
  });
});
