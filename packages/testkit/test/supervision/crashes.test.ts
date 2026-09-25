import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, openHostFixture, pendingWithAttempts, row, rows, send, type HostFixture, workerTests } from '../hosts/harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

function quarantined(): unknown[] {
  return rows(fixture, "SELECT name FROM extensions WHERE status = 'quarantined' ORDER BY name").map((entry) => entry['name']);
}

async function crash(type: string, payload: Record<string, string> = {}): Promise<void> {
  await pendingWithAttempts(fixture, await send(fixture, type, payload), 1);
}

describe('host crashes (plan 03 §3.6, ADR 0082)', workerTests, () => {
  it('M1.7-H3 a crashing handler is redelivered with attempts + 1', async () => {
    const id = await send(fixture, 'notes.crash.once', { mode: 'exit' });
    await pendingWithAttempts(fixture, id, 1);
    fixture.timers.advance(1_000);
    expect(await fixture.runtime.awaitReply(id)).toEqual({ ok: true, value: { mode: 'exit' } });
  });

  it('M1.7-E18 a crash charges every extension running on the worker', async () => {
    const slow = await send(fixture, 'counter.slow.once');
    await eventually(() => expect(row(fixture, slow)['state']).toBe('running'));
    const exiting = await send(fixture, 'notes.crash.once', { mode: 'exit' });
    await pendingWithAttempts(fixture, slow, 1);
    await pendingWithAttempts(fixture, exiting, 1);

    await crash('counter.crash');
    expect(quarantined()).toEqual([]);
    await crash('counter.crash');
    await eventually(() => expect(quarantined()).toEqual(['@acme/counter']));
    await crash('notes.crash.once', { mode: 'exit' });
    await crash('notes.crash.once', { mode: 'exit' });
    await eventually(() => expect(quarantined()).toEqual(['@acme/counter', '@acme/notes']));
  });
});
