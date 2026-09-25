import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, openHostFixture, rows, value, workspaceA, type HostFixture, workerTests } from './harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

describe('a closed ctx (ADR 0076)', workerTests, () => {
  it('M1.6-E35 ctx calls after the handler settled throw INTERNAL and store nothing', async () => {
    await value(fixture, 'notes.late');
    await eventually(async () => {
      const answer = await fixture.runtime.query({ sender: { address: 'user:local' }, type: 'notes.late.errors.get', payload: {}, cause: undefined, workspaceId: workspaceA });
      expect(answer).toEqual({ ok: true, value: { errors: ['INTERNAL', 'INTERNAL'] } });
    });
    expect(rows(fixture, "SELECT id FROM messages WHERE type = 'counter.increment'")).toEqual([]);
  });
});
