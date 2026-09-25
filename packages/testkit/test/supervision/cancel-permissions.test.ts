import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, openHostFixture, row, rows, send, value, workspaceA, type HostFixture, workerTests } from '../hosts/harness.ts';

let fixture: HostFixture;
beforeEach(async () => {
  fixture = await openHostFixture();
});
afterEach(() => fixture.close());

const unknownId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';

describe('who may cancel, and the kernel host (ADRs 0078, 0079)', workerTests, () => {
  it('M1.7-E2 extensions cancel their own messages, or any with kernel.admin; nobody needs a calls grant', async () => {
    const byPerson = await send(fixture, 'counter.wait');
    await value(fixture, 'notes.wait.send');
    await eventually(() => expect(rows(fixture, "SELECT source, state FROM messages WHERE type = 'counter.wait' ORDER BY seq")).toEqual([
      { source: 'user:local', state: 'awaiting' }, { source: 'ext:@acme/notes', state: 'awaiting' },
    ]));
    const byNotes = String(rows(fixture, "SELECT id FROM messages WHERE type = 'counter.wait' ORDER BY seq")[1]?.['id']);

    expect(await value(fixture, 'audit.cancel', { messageId: byPerson })).toEqual({ code: 'CAPABILITY_DENIED' });
    expect(row(fixture, byPerson)['state']).toBe('awaiting');
    expect(await value(fixture, 'notes.cancel.call', { messageId: byNotes })).toEqual({ result: { cancelled: 1 } });

    fixture.grants['@acme/audit'] = { isolation: 'shared', requested: [{ name: 'kernel.admin' }], derived: { subscribes: [], providesLlm: [] } };
    expect(await value(fixture, 'audit.cancel', { messageId: byPerson })).toEqual({ result: { cancelled: 1 } });
  });

  it('M1.7-E3 cancel payloads are validated, and an unknown message cancels nothing', async () => {
    for (const payload of [{}, { messageId: unknownId, correlationId: unknownId }]) {
      const submission = await fixture.runtime.submitCommand({ sender: { address: 'user:local' }, workspaceId: workspaceA, idempotencyKey: `e3-${Object.keys(payload).length}`, type: 'kernel.cancel', payload });
      expect(submission).toMatchObject({ ok: false, problem: { code: 'VALIDATION_FAILED' } });
    }
    expect(await value(fixture, 'kernel.cancel', { messageId: unknownId })).toEqual({ cancelled: 0 });
  });

  it('M1.7-E20 kernel commands run in the kernel host', async () => {
    const id = await send(fixture, 'kernel.cancel', { messageId: unknownId });
    expect(await fixture.runtime.awaitReply(id)).toEqual({ ok: true, value: { cancelled: 0 } });
    expect(row(fixture, id)).toMatchObject({ handler: 'kernel', state: 'done' });
    expect(fixture.runtime.hosts.workers()).toEqual([]);
  });
});
