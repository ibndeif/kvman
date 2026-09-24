import { describe, expect, it } from 'vitest';
import { priorityCodes } from '../../src/index.ts';
import { complete, openSchedulerFixture, pdfProcess, row, submit, type SchedulerFixture } from './harness.ts';

function openOneSlot(fixture: SchedulerFixture): void {
  fixture.dispatcher.setCommandSlots('@acme/pdf', 1);
  fixture.scheduler.pump();
}

async function claimsOneByOne(fixture: SchedulerFixture, count: number): Promise<string[]> {
  openOneSlot(fixture);
  const order: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const claimed = fixture.dispatcher.claimedIds().at(-1);
    if (claimed === undefined) throw new Error('nothing claimed');
    order.push(claimed);
    await complete(fixture, claimed);
  }
  return order;
}

describe('priority classes (plan 02 §2.6, 03 §3.4)', () => {
  it('M1.5-H5 a handler of a user command sends interactive work, and a higher request is lowered', async () => {
    const fixture = openSchedulerFixture();
    fixture.dispatcher.setCommandSlots('@acme/pdf', 1);
    const action = await submit(fixture, 'pdf.render');
    const normal = await submit(fixture, 'pdf.render', {}, { priority: 'normal' });
    const fromProcess = await submit(fixture, 'pdf.render', {}, { sender: pdfProcess, priority: 'interactive' });
    const result = await complete(fixture, action, { ok: true, value: null }, { sends: [{ type: 'pdf.render', payload: {} }] });
    const sent = result.committed ? result.inserted[0]?.message.id : undefined;
    expect(row(fixture, sent ?? '')['priority']).toBe(priorityCodes.interactive);
    expect(row(fixture, fromProcess)['priority']).toBe(priorityCodes.normal);
    expect(fixture.dispatcher.claimedIds()).toEqual([action, sent]);
    await complete(fixture, sent ?? '');
    await complete(fixture, normal);
    expect(fixture.dispatcher.claimedIds()).toEqual([action, sent, normal, fromProcess]);
  });

  it('M1.5-E1 the higher class is claimed first', async () => {
    const fixture = openSchedulerFixture();
    fixture.dispatcher.setCommandSlots('@acme/pdf', 0);
    const background = await submit(fixture, 'pdf.render', {}, { priority: 'background' });
    const normal = await submit(fixture, 'pdf.import', {}, { priority: 'normal' });
    const interactive = await submit(fixture, 'pdf.convert');
    expect(await claimsOneByOne(fixture, 3)).toEqual([interactive, normal, background]);
  });

  it('M1.5-E2 a background message runnable for 30 s counts as normal', async () => {
    const early = openSchedulerFixture();
    early.dispatcher.setCommandSlots('@acme/pdf', 0);
    await submit(early, 'pdf.render', {}, { priority: 'background' });
    early.timers.advance(1_000);
    const normal = await submit(early, 'pdf.render', {}, { priority: 'normal' });
    early.timers.advance(28_000);
    openOneSlot(early);
    expect(early.dispatcher.claimedIds()).toEqual([normal]);

    const aged = openSchedulerFixture();
    aged.dispatcher.setCommandSlots('@acme/pdf', 0);
    const background = await submit(aged, 'pdf.render', {}, { priority: 'background' });
    aged.timers.advance(1_000);
    await submit(aged, 'pdf.render', {}, { priority: 'normal' });
    aged.timers.advance(29_000);
    openOneSlot(aged);
    expect(aged.dispatcher.claimedIds()).toEqual([background]);

    const delayed = openSchedulerFixture();
    delayed.dispatcher.setCommandSlots('@acme/pdf', 0);
    await submit(delayed, 'pdf.render', {}, { priority: 'background', delayMs: 60_000 });
    delayed.timers.advance(60_000);
    const later = await submit(delayed, 'pdf.render', {}, { priority: 'normal' });
    delayed.timers.advance(10_000);
    openOneSlot(delayed);
    expect(delayed.dispatcher.claimedIds()).toEqual([later]);
  });

  it('M1.5-E5 a keyless queue offers its highest class, then its lowest seq', async () => {
    const fixture = openSchedulerFixture();
    fixture.dispatcher.setCommandSlots('@acme/pdf', 0);
    const first = await submit(fixture, 'pdf.render', {}, { priority: 'normal' });
    const second = await submit(fixture, 'pdf.render');
    const third = await submit(fixture, 'pdf.render', {}, { priority: 'normal' });
    expect(await claimsOneByOne(fixture, 3)).toEqual([second, first, third]);
  });
});
