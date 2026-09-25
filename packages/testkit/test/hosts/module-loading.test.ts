import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openHostFixture, row, send, value, workspaceA, type HostFixture } from './harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

describe('loading extensions in a worker (plan 05 §5.1, ADR 0071)', () => {
  it('M1.6-E30 setup that records something other than the installed manifest fails loading', async () => {
    const id = await send(fixture, 'drift.run');
    expect(await fixture.runtime.awaitReply(id)).toMatchObject({
      ok: false, problem: { code: 'EXT_MANIFEST_INVALID', retryable: false, params: { path: 'types.0.description' } },
    });
    expect(row(fixture, id)).toMatchObject({ state: 'failed', attempts: 0 });
  });

  it('M1.6-E31 an extension loads once per worker', async () => {
    for (const text of ['one', 'two', 'three']) await value(fixture, 'notes.add', { text });
    const answer = await fixture.runtime.query({ sender: { address: 'user:local' }, type: 'notes.setup.count.get', payload: {}, cause: undefined, workspaceId: workspaceA });
    expect(answer).toEqual({ ok: true, value: { count: 2 } });
    expect(fixture.runtime.hosts.workers()).toHaveLength(1);
  });
});
