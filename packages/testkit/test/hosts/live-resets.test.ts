import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { kv, openHostFixture, pendingWithAttempts, row, send, type HostFixture, workerTests } from './harness.ts';

let fixture: HostFixture;
beforeEach(async () => {
  fixture = await openHostFixture();
});
afterEach(() => fixture.close());

describe('live resets (plan 02 §2.3, ADR 0067)', workerTests, () => {
  it('M1.6-H12 a crashed attempt\'s live events are reset before the retry publishes again', async () => {
    const id = await send(fixture, 'notes.stream');
    await pendingWithAttempts(fixture, id, 1);
    fixture.timers.advance(1_000);
    await fixture.runtime.awaitReply(id);
    const frames = fixture.live.filter((frame) => frame.type === 'notes.text.streamed');
    expect(frames.every((frame) => frame.run === id)).toBe(true);
    const shown = frames.map((frame) => `${frame.key}:${'text' in frame.chunk ? frame.chunk.text : 'reset'}`);
    expect(shown.slice(0, 3)).toEqual(['a:one', 'a:two', 'b:three']);
    expect(shown.slice(3, 5).sort()).toEqual(['a:reset', 'b:reset']);
    expect(shown.slice(5)).toEqual(['a:one', 'a:two', 'b:three', 'a:again']);
  });

  it('M1.6-E28 a storage conflict resets the run\'s live events and reruns the handler at once', async () => {
    const id = await send(fixture, 'notes.bump');
    expect(await fixture.runtime.awaitReply(id)).toEqual({ ok: true, value: { count: 100 } });
    const frames = fixture.live.filter((frame) => frame.key === 'bump');
    expect(frames.map((frame) => [frame.run, frame.chunk])).toEqual([[id, { text: '0' }], [id, { reset: true }], [id, { text: '100' }]]);
    expect(row(fixture, id)).toMatchObject({ state: 'done', attempts: 0 });
    expect(kv(fixture, '@acme/notes', 'bump')).toBe(101);
  });
});
