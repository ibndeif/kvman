import { describe, expect, it } from 'vitest';
import { complete, openSchedulerFixture, restart, submit } from './harness.ts';
import { startTime } from './doubles.ts';

describe('timers (plan 02 §2.2, 03 §3.4)', () => {
  it('M1.5-E13 delayed messages are claimed when their notBefore comes', async () => {
    const fixture = openSchedulerFixture();
    const delayed = await submit(fixture, 'pdf.render', {}, { delayMs: 5_000 });
    const atTime = await submit(fixture, 'pdf.render', {}, { at: startTime + 2_000 });
    const now = await submit(fixture, 'pdf.render');
    expect(fixture.dispatcher.claimedIds()).toEqual([now]);
    expect(fixture.timers.armed()).toEqual([startTime + 2_000]);
    fixture.timers.advance(1_999);
    expect(fixture.dispatcher.claimedIds()).toEqual([now]);
    fixture.timers.advance(1);
    expect(fixture.dispatcher.claimedIds()).toEqual([now, atTime]);
    fixture.timers.advance(3_000);
    expect(fixture.dispatcher.claimedIds()).toEqual([now, atTime, delayed]);
  });

  it('M1.5-E14 a timer does not block its lane and joins it when due', async () => {
    const fixture = openSchedulerFixture();
    const delayed = await submit(fixture, 'pdf.translate', { fileId: 'f1' }, { delayMs: 5_000 });
    const undelayed = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    expect(fixture.dispatcher.claimedIds()).toEqual([undelayed]);
    fixture.timers.advance(5_000);
    expect(fixture.dispatcher.claimedIds()).toEqual([undelayed]);
    await complete(fixture, undelayed);
    expect(fixture.dispatcher.claimedIds()).toEqual([undelayed, delayed]);
  });

  it('M1.5-E15 a rebuilt scheduler arms its pending timers again', async () => {
    const fixture = openSchedulerFixture();
    const delayed = await submit(fixture, 'pdf.render', {}, { delayMs: 5_000 });
    const restarted = restart(fixture);
    expect(restarted.timers.armed()).toEqual([startTime + 5_000]);
    restarted.timers.advance(5_000);
    expect(restarted.dispatcher.claimedIds()).toEqual([delayed]);
  });
});
