import { describe, expect, it } from 'vitest';
import { claimOf, commandFrom, complete, fail, openSchedulerFixture, submit } from './harness.ts';

describe('lane reentrancy (plan 02 §2.6, ADR 0063)', () => {
  it('M1.5-H4 calling into an ancestor\'s lane or its own lane fails at once with LANE_REENTRANT', async () => {
    const fixture = openSchedulerFixture();
    const translate = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    const step = await commandFrom(fixture, translate, 'agent.step', { sessionId: 's1' });
    const caller = claimOf(fixture, step);
    expect(fixture.scheduler.laneReentrancy(caller, '@acme/pdf|file:f1')).toMatchObject({ code: 'LANE_REENTRANT', messageId: step, correlationId: translate });
    expect(fixture.scheduler.laneReentrancy(caller, '@kvman/agent|session:s1')).toMatchObject({ code: 'LANE_REENTRANT' });
  });

  it('M1.5-E21 only a lane held by the running chain is reentrant', async () => {
    const fixture = openSchedulerFixture();
    await submit(fixture, 'pdf.translate', { fileId: 'other' });
    const root = await submit(fixture, 'agent.run');
    const caller = claimOf(fixture, await commandFrom(fixture, root, 'agent.run'));
    expect(fixture.scheduler.laneReentrancy(caller, '@acme/pdf|file:other')).toBeUndefined();

    const settledHolder = await submit(fixture, 'pdf.translate', { fileId: 'done' });
    const child = claimOf(fixture, await commandFrom(fixture, settledHolder, 'agent.run'));
    await complete(fixture, settledHolder);
    expect(fixture.scheduler.laneReentrancy(child, '@acme/pdf|file:done')).toBeUndefined();

    const holder = await submit(fixture, 'pdf.translate', { fileId: 'held' });
    const publisher = await commandFrom(fixture, holder, 'pdf.render');
    const published = await complete(fixture, publisher, { ok: true, value: null }, { publishes: [{ type: 'pdf.imported', payload: {} }] });
    const delivery = published.committed ? published.inserted[0]?.message.id ?? '' : '';
    expect(fixture.scheduler.laneReentrancy(claimOf(fixture, delivery), '@acme/pdf|file:held')).toMatchObject({ code: 'LANE_REENTRANT' });

    const backingOff = await submit(fixture, 'pdf.translate', { fileId: 'retry' });
    const waiting = claimOf(fixture, await commandFrom(fixture, backingOff, 'agent.run'));
    await fail(fixture, backingOff);
    expect(fixture.scheduler.laneReentrancy(waiting, '@acme/pdf|file:retry')).toBeUndefined();
  });
});
