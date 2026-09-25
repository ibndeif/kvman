import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHostFixture, rows, run, send, type HostFixture, workerTests } from '../hosts/harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

describe('the nested ctx.command depth limit (plan 02 §2.13, ADR 0085)', workerTests, () => {
  it('M1.7-E14 a ninth nested ctx.command fails VALIDATION_FAILED before anything is stored', async () => {
    expect(await run(fixture, 'notes.nest', { n: 8 })).toEqual({ ok: true, value: { n: 8 } });
    const deep = await send(fixture, 'notes.nest', { n: 9 });
    expect(await fixture.runtime.awaitReply(deep)).toMatchObject({ ok: false, problem: { code: 'VALIDATION_FAILED', params: { limit: 'depth', max: 8 } } });
    expect(rows(fixture, "SELECT id FROM messages WHERE type = 'notes.nest' AND correlation_id = ?", deep)).toHaveLength(9);
  });
});
