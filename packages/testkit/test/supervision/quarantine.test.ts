import { afterEach, describe, expect, it } from 'vitest';
import { eventually, openHostFixture, pendingWithAttempts, restartRuntime, row, rows, run, send, workspaceA, type HostFixture, workerTests } from '../hosts/harness.ts';

let fixture: HostFixture;
afterEach(() => fixture.close());

async function crashCounterThreeTimes(): Promise<void> {
  for (let crash = 0; crash < 3; crash += 1) await pendingWithAttempts(fixture, await send(fixture, 'counter.crash'), 1);
  await eventually(() => expect(rows(fixture, "SELECT name, status, quarantine_reason FROM extensions WHERE status = 'quarantined'")).toEqual([{ name: '@acme/counter', status: 'quarantined', quarantine_reason: 'HOST_FAILURES' }]));
}

async function counterRefusal(): Promise<unknown> {
  const submission = await fixture.runtime.submitCommand({ sender: { address: 'user:local' }, workspaceId: workspaceA, idempotencyKey: `refused-${Date.now()}`, type: 'counter.increment', payload: {} });
  return submission.ok ? 'admitted' : submission.problem.code;
}

describe('quarantine (plan 03 §3.6, ADRs 0080, 0081, 0086)', workerTests, () => {
  it('M1.7-H4 three crashes in 10 minutes quarantine the extension with HOST_FAILURES', async () => {
    fixture = await openHostFixture();
    await crashCounterThreeTimes();
    expect(rows(fixture, "SELECT payload FROM events WHERE type = 'kernel.extension.quarantined'")).toEqual([{ payload: JSON.stringify({ name: '@acme/counter', reason: 'HOST_FAILURES' }) }]);
    expect(await counterRefusal()).toBe('HANDLER_UNAVAILABLE');
  });

  it('M1.7-E15 a quarantine is kept across a restart, and queued messages wait', async () => {
    fixture = await openHostFixture();
    const queued = await send(fixture, 'counter.increment', {}, { delayMs: 1_000 });
    await crashCounterThreeTimes();
    fixture.timers.advance(1_000);
    await run(fixture, 'notes.add', { text: 'after' });
    expect(row(fixture, queued)['state']).toBe('pending');
    fixture = await restartRuntime(fixture);
    await run(fixture, 'notes.add', { text: 'restarted' });
    expect(row(fixture, queued)['state']).toBe('pending');
    expect(await counterRefusal()).toBe('HANDLER_UNAVAILABLE');
  });

  it('M1.7-E16 manifest drift quarantines with EXT_MANIFEST_INVALID', async () => {
    fixture = await openHostFixture();
    expect(await run(fixture, 'drift.run')).toMatchObject({ ok: false, problem: { code: 'EXT_MANIFEST_INVALID', retryable: false } });
    await eventually(() => expect(rows(fixture, "SELECT name, quarantine_reason FROM extensions WHERE status = 'quarantined'")).toEqual([{ name: '@acme/drift', quarantine_reason: 'EXT_MANIFEST_INVALID' }]));
  });
});
