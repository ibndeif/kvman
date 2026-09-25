import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, openHostFixture, run, send, value, type HostFixture, workerTests } from './harness.ts';

let fixture: HostFixture;
beforeEach(async () => {
  fixture = await openHostFixture();
});
afterEach(() => fixture.close());

describe('live events (plan 02 §2.3, §2.5, ADR 0074)', workerTests, () => {
  it('M1.6-H10 a live event of another extension cannot be published', async () => {
    expect(await value(fixture, 'notes.live.foreign')).toEqual({ code: 'CAPABILITY_DENIED' });
    expect(fixture.live).toEqual([]);
  });

  it('M1.6-E16 a live event published through ctx.publish is refused', async () => {
    expect(await run(fixture, 'notes.live.publish')).toMatchObject({ ok: false, problem: { code: 'CAPABILITY_DENIED' } });
  });

  it('M1.6-E17 ctx.live checks the event and the chunk shape, and adds the run', async () => {
    const id = await send(fixture, 'notes.live.checks');
    expect(await fixture.runtime.awaitReply(id)).toEqual({ ok: true, value: { codes: ['CAPABILITY_DENIED', 'VALIDATION_FAILED', 'VALIDATION_FAILED'] } });
    await eventually(() => expect(fixture.live).toEqual([{ type: 'notes.text.streamed', key: 'k', workspaceId: 'a'.repeat(64), run: id, n: 1, chunk: { text: 'fine' } }]));
  });
});
