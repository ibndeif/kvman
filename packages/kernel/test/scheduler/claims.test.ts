import { describe, expect, it } from 'vitest';
import { complete, nextTurn, openSchedulerFixture, row, submit } from './harness.ts';

describe('claims (plan 03 §3.4, 02 §2.12)', () => {
  it('M1.5-E11 a claim marks the row running and hands the stored message to its host', async () => {
    const fixture = openSchedulerFixture();
    const translate = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    const publisher = await submit(fixture, 'pdf.render');
    await complete(fixture, publisher, { ok: true, value: null }, { publishes: [{ type: 'pdf.imported', payload: {} }] });
    const [command, , delivery] = fixture.dispatcher.claims;
    expect(command).toMatchObject({ extension: '@acme/pdf', handler: 'command:pdf.translate', attempt: 1 });
    expect(command?.message).toMatchObject({ id: translate, lane: 'file:f1', payload: { fileId: 'f1' }, context: { locale: 'en' } });
    expect(delivery).toMatchObject({ extension: '@acme/audit', handler: 'subscription:pdf.imported', attempt: 1 });
    expect(delivery?.message).toMatchObject({ kind: 'event', type: 'pdf.imported', delivery: 'durable' });
    expect(row(fixture, translate)['state']).toBe('running');
    expect(row(fixture, delivery?.message.id ?? '')['state']).toBe('running');
    expect(fixture.index.laneQueue('@acme/pdf|file:f1')).toEqual([]);
    expect(fixture.index.keylessQueue('@acme/audit|subscription:pdf.imported')).toEqual([]);
  });

  it('M1.5-E12 a row that is no longer pending is not claimed', async () => {
    const fixture = openSchedulerFixture();
    fixture.dispatcher.setCommandSlots('@acme/pdf', 0);
    const cancelled = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    const next = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    fixture.connection.prepare("UPDATE messages SET state = 'cancelled' WHERE id = ?").run(cancelled);
    fixture.dispatcher.setCommandSlots('@acme/pdf', 1);
    fixture.scheduler.pump();
    await nextTurn();
    expect(fixture.dispatcher.claimedIds()).toEqual([next]);
    expect(row(fixture, cancelled)['state']).toBe('cancelled');
    expect(fixture.index.laneQueue('@acme/pdf|file:f1')).toEqual([]);
  });
});
