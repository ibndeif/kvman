import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, openHostFixture, pendingWithAttempts, replyOf, row, rows, send, type HostFixture, workerTests } from '../hosts/harness.ts';

let fixture: HostFixture;
beforeEach(async () => {
  fixture = await openHostFixture();
});
afterEach(() => fixture.close());

describe('a stuck host (plan 03 §3.4, §3.6, ADR 0084)', workerTests, () => {
  it('M1.7-E9 a stuck host is stopped; its extension is charged and its collateral returns without penalty', async () => {
    const collateral = await send(fixture, 'notes.crash.once', { mode: 'wait' });
    await eventually(() => expect(rows(fixture, "SELECT state FROM steps WHERE message_id = ? AND name = 'first'", collateral)).toEqual([{ state: 'done' }]));
    const hang = await send(fixture, 'counter.hang');
    await eventually(() => expect(row(fixture, hang)['state']).toBe('running'));
    const [worker] = fixture.runtime.hosts.workers();

    fixture.timers.advance(1_000);
    await eventually(() => expect(row(fixture, hang)).toMatchObject({ state: 'dead', attempts: 1 }));
    expect(replyOf(fixture, hang)).toMatchObject({ problem: { code: 'MESSAGE_DEAD', detail: 'the last of 1 attempts failed with HANDLER_TIMEOUT' } });
    expect(row(fixture, collateral)['state']).toBe('running');

    fixture.timers.advance(2_000);
    expect(await fixture.runtime.awaitReply(collateral)).toEqual({ ok: true, value: { mode: 'wait' } });
    expect(row(fixture, collateral)['attempts']).toBe(0);
    expect(fixture.runtime.hosts.workers().map((running) => running.id)).not.toContain(worker?.id);

    for (let crash = 0; crash < 2; crash += 1) await pendingWithAttempts(fixture, await send(fixture, 'counter.crash'), 1);
    await eventually(() => expect(rows(fixture, "SELECT name FROM extensions WHERE status = 'quarantined'")).toEqual([{ name: '@acme/counter' }]));
  });
});
