import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, kv, objectOf, openHostFixture, pendingWithAttempts, replyOf, rows, run, send, value, type HostFixture } from './harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

function rowsOf(type: string): Array<Record<string, unknown>> {
  return rows(fixture, 'SELECT * FROM messages WHERE type = ? ORDER BY seq', type);
}

async function continuationOf(commandId: string): Promise<unknown> {
  await eventually(() => expect(kv(fixture, '@acme/notes', `continuation:${commandId}`)).toBeDefined());
  return kv(fixture, '@acme/notes', `continuation:${commandId}`);
}

describe('request and reply (plan 02 §2.8, ADR 0072)', () => {
  it('M1.6-H5 ctx.command waits for another command\'s result', async () => {
    const parent = await send(fixture, 'notes.summarize');
    expect(await fixture.runtime.awaitReply(parent)).toEqual({ ok: true, value: { total: 2 } });
    expect(rowsOf('counter.increment')).toMatchObject([{ causation_id: parent, idempotency_key: `${parent}:command:1`, source: 'ext:@acme/notes', state: 'done' }]);
  });

  it('M1.6-H6 a continuation delivers a reply as a new command', async () => {
    const archive = await send(fixture, 'notes.archive');
    await fixture.runtime.awaitReply(archive);
    await eventually(() => expect(rowsOf('counter.increment')).toHaveLength(1));
    const counterId = String(rowsOf('counter.increment')[0]?.['id']);
    expect(await continuationOf(counterId)).toEqual({ reply: { ok: true, value: { total: 1 } }, context: { note: 'n1' } });
    expect(rowsOf('notes.archive.record')).toMatchObject([{ source: 'kernel', causation_id: counterId, idempotency_key: `${counterId}:reply` }]);
  });

  it('M1.6-H14 a stored reply reaches ctx.command and a continuation', async () => {
    const checked = await value(fixture, 'notes.fail.check');
    await value(fixture, 'notes.fail.send', { target: 'counter.fail' });
    await eventually(() => expect(rowsOf('counter.fail').map((stored) => stored['state'])).toEqual(['failed', 'failed']));
    const [awaited, continued] = rowsOf('counter.fail').map((stored) => String(stored['id']));
    const awaitedReply = replyOf(fixture, String(awaited));
    expect(awaitedReply).toMatchObject({ ok: false, problem: { code: 'counter/NEGATIVE' } });
    expect(awaitedReply).toEqual({ ok: false, problem: objectOf(checked)['problem'] });
    expect(await continuationOf(String(continued))).toEqual({ reply: replyOf(fixture, String(continued)) });
  });

  it('M1.6-E7 a rethrown child problem passes through unchanged', async () => {
    const reply = await run(fixture, 'notes.summarize.strict');
    const child = String(rowsOf('counter.fail')[0]?.['id']);
    expect(reply).toEqual(replyOf(fixture, child));
  });

  it('M1.6-E8 a redelivered ctx.command re-awaits the same command', async () => {
    const id = await send(fixture, 'notes.redeliver');
    await pendingWithAttempts(fixture, id, 1);
    fixture.timers.advance(1_000);
    expect(await fixture.runtime.awaitReply(id)).toEqual({ ok: true, value: { total: 1 } });
    expect(rowsOf('counter.increment')).toHaveLength(1);
    expect(kv(fixture, '@acme/counter', 'total')).toBe(1);
  });

  it('M1.6-E9 ctx.command into a lane its chain holds fails at once', async () => {
    expect(await value(fixture, 'notes.edit', { id: 'x' })).toEqual({ code: 'LANE_REENTRANT' });
    expect(rowsOf('notes.edit')).toHaveLength(1);
  });

  it('M1.6-E10 a ctx.command refused at admission stores nothing', async () => {
    expect(await value(fixture, 'notes.call', { target: 'counter.secret' })).toEqual({ code: 'CAPABILITY_DENIED' });
    expect(rowsOf('counter.secret')).toEqual([]);
  });

  it('M1.6-E11 a command that dies reaches its waiters with MESSAGE_DEAD', async () => {
    const caller = await send(fixture, 'notes.call', { target: 'counter.broken' });
    await value(fixture, 'notes.fail.send', { target: 'counter.broken' });
    await eventually(() => expect(rowsOf('counter.broken')).toHaveLength(2));
    const [awaited, continued] = rowsOf('counter.broken').map((stored) => String(stored['id']));
    await pendingWithAttempts(fixture, String(awaited), 1);
    await pendingWithAttempts(fixture, String(continued), 1);
    fixture.timers.advance(1_000);
    await pendingWithAttempts(fixture, String(awaited), 2);
    await pendingWithAttempts(fixture, String(continued), 2);
    fixture.timers.advance(5_000);
    expect(await fixture.runtime.awaitReply(caller)).toEqual({ ok: true, value: { code: 'MESSAGE_DEAD' } });
    expect(await continuationOf(String(continued))).toMatchObject({ reply: { ok: false, problem: { code: 'MESSAGE_DEAD' } } });
  });

  it('M1.6-E14 ctx.send with an idempotency key sends once across invocations', async () => {
    expect(await run(fixture, 'notes.remind')).toMatchObject({ ok: true });
    expect(await run(fixture, 'notes.remind')).toMatchObject({ ok: true });
    expect(rowsOf('counter.increment')).toMatchObject([{ idempotency_key: 'daily' }]);
  });
});

