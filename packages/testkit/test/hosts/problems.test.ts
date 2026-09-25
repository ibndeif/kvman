import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, openHostFixture, pendingWithAttempts, replyOf, row, send, type HostFixture, workerTests } from './harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

describe('problems thrown by handlers (plan 13 §13.1, ADR 0074)', workerTests, () => {
  it('M1.6-E3 a registered problem takes its definition', async () => {
    const id = await send(fixture, 'counter.fail');
    expect(await fixture.runtime.awaitReply(id)).toEqual({
      ok: false,
      problem: {
        code: 'counter/NEGATIVE', title: 'The count cannot go below zero', hint: 'send a positive number', retryable: false,
        params: { by: -1 }, detail: 'below zero', correlationId: id, messageId: id,
      },
    });
    expect(row(fixture, id)).toMatchObject({ state: 'failed', attempts: 0 });
  });

  it('M1.6-E4 a registered retryable problem is retried', async () => {
    const id = await send(fixture, 'counter.flaky');
    await pendingWithAttempts(fixture, id, 1);
    fixture.timers.advance(1_000);
    expect(await fixture.runtime.awaitReply(id)).toEqual({ ok: true, value: { ok: true } });
  });

  it('M1.6-E5 an unregistered code is delivered as it is and logged as a warning', async () => {
    const id = await send(fixture, 'counter.unknown.code');
    expect(await fixture.runtime.awaitReply(id)).toMatchObject({ ok: false, problem: { code: 'counter/UNKNOWN', title: 'counter/UNKNOWN', retryable: false } });
    expect(fixture.logged).toContainEqual(expect.objectContaining({
      level: 'warn', message: expect.stringContaining('counter/UNKNOWN'), attributes: expect.objectContaining({ extension: '@acme/counter', messageId: id }),
    }));
  });

  it('M1.6-E6 any other thrown value is INTERNAL, retried until dead', async () => {
    const id = await send(fixture, 'counter.broken');
    await pendingWithAttempts(fixture, id, 1);
    fixture.timers.advance(1_000);
    await pendingWithAttempts(fixture, id, 2);
    fixture.timers.advance(5_000);
    await eventually(() => expect(row(fixture, id)).toMatchObject({ state: 'dead', attempts: 3 }));
    expect(replyOf(fixture, id)).toMatchObject({ ok: false, problem: { code: 'MESSAGE_DEAD', detail: 'the last of 3 attempts failed with INTERNAL' } });
    const errors = fixture.logged.filter((record) => record.level === 'error' && record.attributes.messageId === id);
    expect(errors.map((record) => record.fields)).toEqual([{ error: 'TypeError' }, { error: 'TypeError' }, { error: 'TypeError' }]);
    expect(JSON.stringify(fixture.logged)).not.toContain('boom');
  });
});
