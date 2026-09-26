import { afterEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA } from '../hosts/harness.ts';
import { command, openInstallFixture, type InstallFixture } from '../install/harness.ts';
import { rows, run, start, valueOf } from '../workspaces/harness.ts';
import { blobTests, expectNoDanglingRefs, holderMake, keeperPut, openBlobFixture, refsOf } from './harness.ts';

const minutes = 60_000;

let fixture: InstallFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

// The kernel clock moves by 10-minute steps, and each GC run it fires finishes before the next step.
async function runGc(open: InstallFixture, times: number): Promise<void> {
  for (let run = 0; run < times; run += 1) {
    open.timers.advance(10 * minutes);
    await open.runtime.files.collector.idle();
  }
}

function stored(open: InstallFixture, blobId: string): boolean {
  return rows(open, 'SELECT id FROM blobs WHERE id = ?', blobId).length === 1 && open.runtime.files.files.exists(blobId);
}

describe('blob GC (plan 04 §4.6, ADR 0134)', blobTests, () => {
  it('M2.5-H5 a blob put by a handler that runs past the GC grace survives until its commit', async () => {
    const open = await openBlobFixture();
    fixture = open;
    const slow = await start(open, 'keeper.slow', { text: 'long running' });
    await eventually(() => expect(rows(open, "SELECT state FROM messages WHERE type = 'holder.gate'")).toEqual([{ state: 'awaiting' }]));
    const [put] = rows(open, 'SELECT blob_id FROM blob_refs WHERE ref = ?', `pending:${slow}`);
    const blobId = String(put?.['blob_id']);
    await runGc(open, 12);
    expect(stored(open, blobId)).toBe(true);
    const [gate] = rows(open, "SELECT id FROM messages WHERE type = 'holder.gate'");
    await run(open, 'holder.open', { commandId: String(gate?.['id']) });
    expect(await open.runtime.awaitReply(slow)).toEqual({ ok: true, value: { blobId } });
    expect(refsOf(open, blobId)).toEqual([{ owner: '@acme/keeper', ws: workspaceA, ref: `blob:${blobId}`, expires_at: null }]);
    await runGc(open, 1);
    expect(valueOf(await run(open, 'keeper.read', { blobId, as: 'text' }))).toEqual({ value: 'long running' });
    expectNoDanglingRefs(open);
  });

  it('M2.5-E14 GC runs at boot and every 10 minutes', async () => {
    const first = await openBlobFixture();
    const atBoot = await keeperPut(first, { text: 'collected at boot' });
    const later = await keeperPut(first, { text: 'collected later' });
    for (const blob of [atBoot, later]) await run(first, 'keeper.keep', { blobId: blob.blobId, release: true });
    first.connection.prepare('UPDATE blobs SET created_at = created_at - ? WHERE id = ?').run(2 * 60 * minutes, atBoot.blobId);
    const { home } = first;
    await first.close();
    const reopened = await openInstallFixture({ home });
    fixture = reopened;
    expect([stored(reopened, atBoot.blobId), stored(reopened, later.blobId)]).toEqual([false, true]);
    reopened.connection.prepare('UPDATE blobs SET created_at = created_at - ? WHERE id = ?').run(2 * 60 * minutes, later.blobId);
    await runGc(reopened, 1);
    expect(stored(reopened, later.blobId)).toBe(false);
  });

  it('M2.5-E16 forget and uninstall drop references', async () => {
    const open = await openBlobFixture();
    fixture = open;
    const kept = await keeperPut(open, { text: 'kept by the keeper' });
    expect(valueOf(await command(open, 'kernel.extension.disable', { workspaceId: workspaceA, name: '@acme/keeper' }))).toMatchObject({ revision: expect.any(Number) });
    expect(await command(open, 'kernel.extension.uninstall', { name: '@acme/keeper', deleteData: true })).toEqual({ ok: true, value: {} });
    expect(refsOf(open, kept.blobId)).toEqual([]);
    const made = await holderMake(open, 'made by the holder');
    expect(await command(open, 'kernel.workspace.forget', { workspaceId: workspaceA })).toEqual({ ok: true, value: {} });
    expect(refsOf(open, made.blobId)).toEqual([]);
    await runGc(open, 7);
    expect([stored(open, kept.blobId), stored(open, made.blobId)]).toEqual([false, false]);
  });
});
