import { afterEach, describe, expect, it } from 'vitest';
import { eventually, openHostFixture, replyOf, restartRuntime, row, rows, send, workerTests, type HostFixture } from '../hosts/harness.ts';

let fixture: HostFixture;
afterEach(async () => {
  await fixture.close();
});

// restartRuntime stops the runtime without a drain, so its running rows stay running as after a crash (ADR 0091).
describe('recovery after a crash (plan 03 §3.9 step 6, ADR 0091)', workerTests, () => {
  it('M1.8-E16 a running row after a crash redelivers with attempts + 1', async () => {
    fixture = await openHostFixture();
    const id = await send(fixture, 'notes.edit.slow', { id: 'e16' });
    await eventually(() => expect(row(fixture, id)).toMatchObject({ state: 'running', attempts: 0 }));
    fixture = await restartRuntime(fixture);
    expect(row(fixture, id)).toMatchObject({ attempts: 1 });
    await eventually(() => expect(row(fixture, id)).toMatchObject({ state: 'running', attempts: 1 }));
  });

  it('M1.8-E17 a crashed row at maxAttempts becomes dead', async () => {
    fixture = await openHostFixture();
    const id = await send(fixture, 'counter.hang');
    await eventually(() => expect(row(fixture, id)['state']).toBe('running'));
    fixture = await restartRuntime(fixture);
    expect(row(fixture, id)).toMatchObject({ state: 'dead', attempts: 1 });
    expect(replyOf(fixture, id)).toMatchObject({ ok: false, problem: { code: 'MESSAGE_DEAD', messageId: id } });
    const [event] = rows(fixture, "SELECT payload FROM events WHERE type = 'kernel.message.dead-lettered'");
    expect(JSON.parse(String(event?.['payload']))).toEqual({ messageId: id, type: 'counter.hang', correlationId: id });
  });

  it('M1.8-E18 recovery keeps lane order', async () => {
    fixture = await openHostFixture();
    const first = await send(fixture, 'notes.edit.slow', { id: 'lane' });
    await eventually(() => expect(row(fixture, first)['state']).toBe('running'));
    const second = await send(fixture, 'notes.edit.slow', { id: 'lane' });
    expect(row(fixture, second)['state']).toBe('pending');
    fixture = await restartRuntime(fixture);
    await eventually(() => expect(row(fixture, first)['state']).toBe('running'));
    expect(row(fixture, second)['state']).toBe('pending');
  });
});
