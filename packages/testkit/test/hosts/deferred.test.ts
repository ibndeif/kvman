import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, kv, objectOf, openHostFixture, row, rows, run, send, value, type HostFixture } from './harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

async function awaiting(id: string): Promise<void> {
  await eventually(() => expect(row(fixture, id)['state']).toBe('awaiting'));
}

describe('deferred replies (plan 02 §2.8, ADRs 0066, 0074)', () => {
  it('M1.6-H7 a deferred reply completes a command; a second reply fails REPLY_NOT_AWAITING', async () => {
    const askId = await send(fixture, 'notes.ask', { id: 'q1' });
    await awaiting(askId);
    expect(row(fixture, askId)).toMatchObject({ on_abort: 'notes.question.expire', result: null });
    const waiting = fixture.runtime.awaitReply(askId);
    expect(await run(fixture, 'notes.question.answer', { askId, answer: 'yes' })).toMatchObject({ ok: true });
    expect(await waiting).toEqual({ ok: true, value: { answer: 'yes' } });
    expect(row(fixture, askId)['state']).toBe('done');

    const second = await send(fixture, 'notes.question.answer', { askId, answer: 'no' });
    expect(await fixture.runtime.awaitReply(second)).toMatchObject({ ok: false, problem: { code: 'REPLY_NOT_AWAITING', retryable: false } });
    expect(row(fixture, second)).toMatchObject({ state: 'failed', attempts: 0 });
    expect(kv(fixture, '@acme/notes', `answered:${second}`)).toBeUndefined();
  });

  it('M1.6-E18 defer outside a command handler, or with a wrong onAbort, fails VALIDATION_FAILED', async () => {
    expect(await value(fixture, 'notes.defer.checks')).toEqual({ codes: ['VALIDATION_FAILED', 'VALIDATION_FAILED'] });
    const id = String(objectOf(await value(fixture, 'notes.add', { text: 'hi' }))['id']);
    await eventually(() => expect(kv(fixture, '@acme/notes', `subscription-defer:${id}`)).toBe('VALIDATION_FAILED'));
  });

  it('M1.6-E19 a reply to another extension\'s command rolls the unit back with CAPABILITY_DENIED', async () => {
    const waitId = await send(fixture, 'counter.wait');
    await awaiting(waitId);
    const replier = await send(fixture, 'notes.reply.other', { commandId: waitId });
    expect(await fixture.runtime.awaitReply(replier)).toMatchObject({ ok: false, problem: { code: 'CAPABILITY_DENIED' } });
    expect(kv(fixture, '@acme/notes', `replied:${replier}`)).toBeUndefined();
    expect(row(fixture, waitId)['state']).toBe('awaiting');
  });

  it('M1.6-E20 a reply to a command that is not awaiting fails REPLY_NOT_AWAITING', async () => {
    const done = await send(fixture, 'notes.add', { text: 'hi' });
    await fixture.runtime.awaitReply(done);
    const running = await send(fixture, 'notes.crash.once', { mode: 'wait' });
    await eventually(() => expect(row(fixture, running)['state']).toBe('running'));
    for (const commandId of [done, running]) {
      expect(await run(fixture, 'notes.reply.other', { commandId })).toMatchObject({ ok: false, problem: { code: 'REPLY_NOT_AWAITING' } });
    }
  });

  it('M1.6-E21 a deferred command frees its lane', async () => {
    const first = await send(fixture, 'notes.ask', { id: 'q1' });
    const second = await send(fixture, 'notes.ask', { id: 'q1' });
    await awaiting(first);
    await awaiting(second);
  });

  it('M1.6-E22 a deferred reply reaches the command\'s continuation in the same transaction', async () => {
    await value(fixture, 'notes.start', { id: 'q2' });
    await eventually(() => expect(rows(fixture, "SELECT id FROM messages WHERE type = 'notes.ask' AND state = 'awaiting'")).toHaveLength(1));
    const askId = String(rows(fixture, "SELECT id FROM messages WHERE type = 'notes.ask'")[0]?.['id']);
    await value(fixture, 'notes.question.answer', { askId, answer: 'yes' });
    expect(rows(fixture, "SELECT causation_id FROM messages WHERE type = 'notes.answer.record'")).toEqual([{ causation_id: askId }]);
    await eventually(() => expect(kv(fixture, '@acme/notes', `recorded:${askId}`)).toEqual({ reply: { ok: true, value: { answer: 'yes' } } }));
  });
});
