import { describe, expect, it } from 'vitest';
import { complete, openSchedulerFixture, submit } from './harness.ts';

describe('lanes (plan 02 §2.6, 03 §3.4)', () => {
  it('M1.5-H1 one message per lane runs at a time, in seq order', async () => {
    const fixture = openSchedulerFixture();
    const first = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    const second = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    const third = await submit(fixture, 'pdf.translate', { fileId: 'f1' });
    const other = await submit(fixture, 'pdf.translate', { fileId: 'f2' });
    expect(fixture.dispatcher.claimedIds()).toEqual([first, other]);
    await complete(fixture, first);
    expect(fixture.dispatcher.claimedIds()).toEqual([first, other, second]);
    await complete(fixture, other);
    expect(fixture.dispatcher.claimedIds()).toEqual([first, other, second]);
    await complete(fixture, second);
    expect(fixture.dispatcher.claimedIds()).toEqual([first, other, second, third]);
  });
});
