import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, openHostFixture, pendingWithAttempts, row, send, workspaceA, type HostFixture } from './harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

describe('a worker that exits (ADR 0067)', () => {
  it('M1.6-E29 its running attempts fail INTERNAL and retry on a new worker; its query answers INTERNAL', async () => {
    const waiting = await send(fixture, 'notes.crash.once', { mode: 'wait' });
    await eventually(() => expect(row(fixture, waiting)['state']).toBe('running'));
    const query = fixture.runtime.query({ sender: { address: 'user:local' }, type: 'notes.slow.get', payload: {}, cause: undefined, workspaceId: workspaceA });
    await eventually(() => expect(fixture.runtime.hosts.workers()[0]?.inFlight).toBe(2));
    const exiting = await send(fixture, 'notes.crash.once', { mode: 'exit' });

    expect(await query).toMatchObject({ ok: false, problem: { code: 'INTERNAL', retryable: true } });
    await pendingWithAttempts(fixture, waiting, 1);
    await pendingWithAttempts(fixture, exiting, 1);
    expect(fixture.runtime.hosts.workers()).toEqual([]);

    fixture.timers.advance(1_000);
    expect(await fixture.runtime.awaitReply(waiting)).toEqual({ ok: true, value: { mode: 'wait' } });
    expect(await fixture.runtime.awaitReply(exiting)).toEqual({ ok: true, value: { mode: 'exit' } });
    expect(fixture.runtime.hosts.workers().map((worker) => worker.id)).toEqual([2]);
  });
});
