import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, kv, openHostFixture, row, rows, send, value, workspaceA, type HostFixture, workerTests } from '../hosts/harness.ts';

let fixture: HostFixture;
beforeEach(async () => {
  fixture = await openHostFixture();
});
afterEach(() => fixture.close());

function stateOf(id: string): unknown {
  return row(fixture, id)['state'];
}

function idOf(type: string): string {
  return String(rows(fixture, 'SELECT id FROM messages WHERE type = ? ORDER BY seq', type)[0]?.['id']);
}

async function cancel(payload: Record<string, string>): Promise<unknown> {
  return value(fixture, 'kernel.cancel', payload);
}

describe('kernel.cancel (plan 02 §2.9, ADR 0083)', workerTests, () => {
  it('M1.7-H1 cancelling a message cancels a ctx.command call and a deferred command it caused', async () => {
    const cascade = await send(fixture, 'notes.cascade');
    await eventually(() => expect(rows(fixture, "SELECT type FROM messages WHERE state = 'awaiting' ORDER BY type")).toEqual([{ type: 'counter.wait' }, { type: 'notes.ask' }]));
    const ask = idOf('notes.ask');
    expect(await cancel({ messageId: cascade })).toEqual({ cancelled: 3 });
    for (const id of [cascade, ask, idOf('counter.wait')]) {
      expect(row(fixture, id)).toMatchObject({ state: 'cancelled' });
      expect(JSON.parse(String(row(fixture, id)['result']))).toMatchObject({ ok: false, problem: { code: 'CANCELLED' } });
    }
    await eventually(() => expect(kv(fixture, '@acme/notes', `expired:${ask}`)).toEqual({ reason: 'cancelled', source: 'kernel' }));
  });

  it('M1.7-H2 cancelling a finished message returns { cancelled: 0 }', async () => {
    const increment = await send(fixture, 'counter.increment');
    await fixture.runtime.awaitReply(increment);
    expect(await cancel({ messageId: increment })).toEqual({ cancelled: 0 });
    expect(stateOf(increment)).toBe('done');
  });

  it('M1.7-E1 cancel by correlation cancels every unfinished message of it', async () => {
    const family = await send(fixture, 'notes.family');
    await fixture.runtime.awaitReply(family);
    await eventually(() => expect(rows(fixture, "SELECT type, state FROM messages WHERE correlation_id = ? AND id != ? ORDER BY type", family, family)).toEqual([
      { type: 'counter.increment', state: 'pending' }, { type: 'notes.ask', state: 'awaiting' }, { type: 'notes.edit.slow', state: 'running' },
    ]));
    expect(await cancel({ correlationId: family })).toEqual({ cancelled: 3 });
    const originals = "('counter.increment', 'notes.ask', 'notes.edit.slow')";
    expect(rows(fixture, `SELECT DISTINCT state FROM messages WHERE correlation_id = ? AND type IN ${originals}`, family)).toEqual([{ state: 'cancelled' }]);
    expect(stateOf(family)).toBe('done');
  });

  it('M1.7-E4 a cancelled timer never runs', async () => {
    const timer = await send(fixture, 'counter.increment', {}, { delayMs: 60_000 });
    expect(await cancel({ messageId: timer })).toEqual({ cancelled: 1 });
    fixture.timers.advance(60_000);
    await value(fixture, 'notes.add', { text: 'later' });
    expect(stateOf(timer)).toBe('cancelled');
    expect(kv(fixture, '@acme/counter', 'total')).toBeUndefined();
  });

  it('M1.7-E5 a cancelled deferred command answers its continuation and sends its onAbort', async () => {
    await value(fixture, 'notes.start', { id: 'e5' });
    await eventually(() => expect(rows(fixture, "SELECT state FROM messages WHERE type = 'notes.ask'")).toEqual([{ state: 'awaiting' }]));
    const ask = idOf('notes.ask');
    expect(await cancel({ messageId: ask })).toEqual({ cancelled: 1 });
    await eventually(() => expect(kv(fixture, '@acme/notes', `recorded:${ask}`)).toMatchObject({ reply: { ok: false, problem: { code: 'CANCELLED' } } }));
    await eventually(() => expect(kv(fixture, '@acme/notes', `expired:${ask}`)).toEqual({ reason: 'cancelled', source: 'kernel' }));
  });

  it('M1.7-E6 a cancelled running handler\'s ctx is closed and its result discarded', async () => {
    const probe = await send(fixture, 'notes.cancel.probe');
    await eventually(() => expect(fixture.live.filter((frame) => frame.key === 'probe')).toHaveLength(1));
    expect(await cancel({ messageId: probe })).toEqual({ cancelled: 1 });
    expect(fixture.live.filter((frame) => frame.key === 'probe').map((frame) => [frame.run, frame.chunk])).toEqual([[probe, { text: 'partial' }], [probe, { reset: true }]]);
    await eventually(async () => {
      const answer = await fixture.runtime.query({ sender: { address: 'user:local' }, type: 'notes.probe.get', payload: {}, cause: undefined, workspaceId: workspaceA });
      expect(answer).toEqual({ ok: true, value: { codes: ['CANCELLED', 'CANCELLED', 'CANCELLED'] } });
    });
    expect(rows(fixture, "SELECT id FROM docs WHERE id = 'probe'")).toEqual([]);
    expect(stateOf(probe)).toBe('cancelled');
  });

  it('M1.7-E7 a cancelled lane holder frees its lane', async () => {
    const first = await send(fixture, 'notes.edit.slow', { id: 'x' });
    await eventually(() => expect(stateOf(first)).toBe('running'));
    const second = await send(fixture, 'notes.edit.slow', { id: 'x' });
    expect(stateOf(second)).toBe('pending');
    await cancel({ messageId: first });
    await eventually(() => expect(stateOf(second)).toBe('running'));
  });

  it('M1.7-E8 queued and running transient deliveries in scope are cancelled', async () => {
    const touch = await send(fixture, 'notes.touch.twice', { id: 'hold' });
    await fixture.runtime.awaitReply(touch);
    await eventually(() => expect(fixture.live.filter((frame) => frame.key === 'hold').map((frame) => frame.chunk)).toEqual([{ data: { phase: 'start', step: 1 } }]));
    expect(await cancel({ messageId: touch })).toEqual({ cancelled: 2 });
    await value(fixture, 'notes.touch', { id: 'after', step: 1 });
    await eventually(() => expect(kv(fixture, '@acme/audit', 'touched:after:1')).toBe(true));
    expect(fixture.live.filter((frame) => frame.key === 'hold').map((frame) => frame.chunk)).toEqual([{ data: { phase: 'start', step: 1 } }, { reset: true }]);
  });

  it('M1.7-E19 a call from an aborted invocation is refused with its abort problem', async () => {
    const probe = await send(fixture, 'notes.cancel.probe');
    await eventually(() => expect(stateOf(probe)).toBe('running'));
    await cancel({ messageId: probe });
    await eventually(async () => {
      const answer = await fixture.runtime.query({ sender: { address: 'user:local' }, type: 'notes.probe.get', payload: {}, cause: undefined, workspaceId: workspaceA });
      expect(answer).toMatchObject({ ok: true, value: { codes: ['CANCELLED', 'CANCELLED', 'CANCELLED'] } });
    });
    expect(rows(fixture, "SELECT id FROM messages WHERE type = 'counter.increment'")).toEqual([]);
  });
});
