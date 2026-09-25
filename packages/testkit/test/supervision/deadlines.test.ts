import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  eventually, kv, objectOf, openHostFixture, pendingWithAttempts, restartRuntime, row, rows, send, value, workspaceA, type HostFixture, workerTests } from '../hosts/harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

function now(): number {
  return fixture.timers.time.value;
}

function failedWith(id: string): unknown {
  const stored = row(fixture, id);
  return { state: stored['state'], attempts: stored['attempts'], code: JSON.parse(String(stored['result']))?.problem?.code };
}

async function firstStepDone(id: string): Promise<void> {
  await eventually(() => expect(rows(fixture, "SELECT state FROM steps WHERE message_id = ? AND name = 'first'", id)).toEqual([{ state: 'done' }]));
}

describe('deadlines and timeouts (plan 02 §2.9, 03 §3.4, ADR 0084)', workerTests, () => {
  it('M1.7-H5 a handler that exceeds its timeoutMs is retried with a fresh timeout', async () => {
    const id = await send(fixture, 'counter.slow.once');
    await firstStepDone(id);
    fixture.timers.advance(1_000);
    await pendingWithAttempts(fixture, id, 1);
    expect(JSON.parse(String(row(fixture, id)['not_before']))).toBe(now() + 1_000);
    fixture.timers.advance(1_000);
    expect(await fixture.runtime.awaitReply(id)).toEqual({ ok: true, value: { ok: true } });
  });

  it('M1.7-H6 a message whose deadline passes in its lane queue fails DEADLINE_EXCEEDED without retry', async () => {
    const holder = await send(fixture, 'notes.edit.slow', { id: 'x' });
    await eventually(() => expect(row(fixture, holder)['state']).toBe('running'));
    const waiting = await send(fixture, 'notes.edit.slow', { id: 'x' }, { deadlineAt: now() + 2_000 });
    fixture.timers.advance(2_000);
    await eventually(() => expect(failedWith(waiting)).toEqual({ state: 'failed', attempts: 0, code: 'DEADLINE_EXCEEDED' }));
    expect(row(fixture, holder)['state']).toBe('running');
  });

  it('M1.7-H7 a running message whose deadline passes fails DEADLINE_EXCEEDED without retry', async () => {
    const id = await send(fixture, 'counter.hang', {}, { deadlineAt: now() + 1_000 });
    await eventually(() => expect(row(fixture, id)['state']).toBe('running'));
    fixture.timers.advance(1_000);
    expect(await fixture.runtime.awaitReply(id)).toMatchObject({ ok: false, problem: { code: 'DEADLINE_EXCEEDED' } });
    expect(failedWith(id)).toEqual({ state: 'failed', attempts: 0, code: 'DEADLINE_EXCEEDED' });
  });

  it('M1.7-H8 ctx.send does not inherit the parent\'s deadline; ctx.command does', async () => {
    const id = await send(fixture, 'notes.deadlines.check');
    const reply = await fixture.runtime.awaitReply(id);
    if (!reply.ok) throw new Error(reply.problem.code);
    const deadline = objectOf(reply.value)['deadlineAt'];
    expect(deadline).toBe(now() + 60_000);
    await eventually(() => expect(rows(fixture, "SELECT idempotency_key, deadline_at FROM messages WHERE type = 'counter.increment' ORDER BY idempotency_key")).toEqual([
      { idempotency_key: `${id}:command:1`, deadline_at: deadline }, { idempotency_key: `${id}:command:2`, deadline_at: deadline },
      { idempotency_key: `${id}:send:0`, deadline_at: null },
    ]));
  });

  it('M1.7-H9 a deferred command whose deadline passes sends its onAbort', async () => {
    const ask = await send(fixture, 'notes.ask', { id: 'h9' }, { deadlineAt: now() + 5_000 });
    await eventually(() => expect(row(fixture, ask)['state']).toBe('awaiting'));
    const waiting = fixture.runtime.awaitReply(ask);
    fixture.timers.advance(5_000);
    expect(await waiting).toMatchObject({ ok: false, problem: { code: 'DEADLINE_EXCEEDED' } });
    expect(failedWith(ask)).toEqual({ state: 'failed', attempts: 0, code: 'DEADLINE_EXCEEDED' });
    await eventually(() => expect(kv(fixture, '@acme/notes', `expired:${ask}`)).toEqual({ reason: 'deadline', source: 'kernel' }));
  });

  it('M1.7-E10 a query past its timeout answers QUERY_TIMEOUT', async () => {
    const answer = fixture.runtime.query({ sender: { address: 'user:local' }, type: 'notes.slow.get', payload: {}, cause: undefined, workspaceId: workspaceA });
    await eventually(() => expect(fixture.runtime.hosts.workers()[0]?.inFlight).toBe(1));
    fixture.timers.advance(5_000);
    expect(await answer).toMatchObject({ ok: false, problem: { code: 'QUERY_TIMEOUT' } });
  });

  it('M1.7-E11 the invocation deadline is the message deadline or the timeout, whichever is first', async () => {
    const start = now();
    expect(await value(fixture, 'notes.describe.deadline')).toEqual({ deadlineAt: start + 60_000 });
    const early = await send(fixture, 'notes.describe.deadline', {}, { deadlineAt: start + 500 });
    expect(await fixture.runtime.awaitReply(early)).toEqual({ ok: true, value: { deadlineAt: start + 500 } });
    const slow = await send(fixture, 'counter.slow.once', {}, { deadlineAt: start + 500 });
    await firstStepDone(slow);
    fixture.timers.advance(500);
    await eventually(() => expect(failedWith(slow)).toEqual({ state: 'failed', attempts: 0, code: 'DEADLINE_EXCEEDED' }));
  });

  it('M1.7-E12 deadline timers survive a restart', async () => {
    const ask = await send(fixture, 'notes.ask', { id: 'e12' }, { deadlineAt: now() + 5_000 });
    const timer = await send(fixture, 'counter.increment', {}, { delayMs: 10_000, deadlineAt: now() + 5_000 });
    await eventually(() => expect(row(fixture, ask)['state']).toBe('awaiting'));
    fixture = await restartRuntime(fixture);
    fixture.timers.advance(5_000);
    await eventually(() => expect([failedWith(ask), failedWith(timer)]).toEqual([
      { state: 'failed', attempts: 0, code: 'DEADLINE_EXCEEDED' }, { state: 'failed', attempts: 0, code: 'DEADLINE_EXCEEDED' },
    ]));
    await eventually(() => expect(kv(fixture, '@acme/notes', `expired:${ask}`)).toEqual({ reason: 'deadline', source: 'kernel' }));
  });

  it('M1.7-E13 a continuation has no deadline', async () => {
    const deadline = now() + 5_000;
    await value(fixture, 'notes.archive', { deadlineAt: deadline });
    await eventually(() => expect(rows(fixture, "SELECT deadline_at FROM messages WHERE type = 'notes.archive.record'")).toEqual([{ deadline_at: null }]));
    expect(rows(fixture, "SELECT deadline_at FROM messages WHERE type = 'counter.increment'")).toEqual([{ deadline_at: deadline }]);
  });
});
