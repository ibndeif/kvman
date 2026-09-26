import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA } from '../hosts/harness.ts';
import { command, problemOf, type InstallFixture } from '../install/harness.ts';
import { query, rows, run, start, valueOf } from '../workspaces/harness.ts';
import { blobTests, holderMake, keeperPut, kvOf, openBlobFixture, refsOf } from './harness.ts';

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openBlobFixture();
});
afterEach(async () => {
  await fixture.close();
});

describe('blob hand-over (plan 04 §4.6, ADR 0134)', blobTests, () => {
  it('M2.5-H1 a blob ID without a ref or hand-over is refused', async () => {
    const held = await holderMake(fixture, 'holder only');
    expect(valueOf(await run(fixture, 'keeper.read', { blobId: held.blobId, as: 'text' }))).toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(problemOf(await run(fixture, 'keeper.send', { blobId: held.blobId })).code).toBe('CAPABILITY_DENIED');
    expect(rows(fixture, "SELECT id FROM messages WHERE type = 'holder.take'")).toEqual([]);
    const kept = await keeperPut(fixture, { text: 'keeper only' });
    expect(valueOf(await run(fixture, 'holder.peek', { blobId: kept.blobId }))).toMatchObject({ code: 'CAPABILITY_DENIED' });
  });

  it('M2.5-E3 a hand-over through a payload, a reply, a query result, an event, and a continuation', async () => {
    expect(valueOf(await run(fixture, 'keeper.give', { text: 'given' }))).toEqual({ text: 'given' });
    expect(valueOf(await run(fixture, 'keeper.fetch', { text: 'made' }))).toEqual({ made: 'made', found: 'made' });
    await run(fixture, 'keeper.share', { text: 'shared' });
    await eventually(() => expect(kvOf(fixture, '@acme/holder', 'shared')).toBe('shared'));
    await run(fixture, 'keeper.continue', { text: 'continued' });
    await eventually(() => expect(kvOf(fixture, '@acme/keeper', 'made')).toBe('continued'));
    const given = rows(fixture, "SELECT blob_id FROM blob_refs WHERE owner = '@acme/keeper'").map((row) => row['blob_id']);
    for (const blobId of given) expect(refsOf(fixture, String(blobId)).map((ref) => ref['owner'])).not.toContain('@acme/holder');
    const made = rows(fixture, "SELECT blob_id FROM blob_refs WHERE owner = '@acme/holder'").map((row) => row['blob_id']);
    for (const blobId of made) expect(refsOf(fixture, String(blobId)).map((ref) => ref['owner'])).not.toContain('@acme/keeper');
  });

  it('M2.5-E4 a result may name only blobs its handler may read', async () => {
    const held = await holderMake(fixture, 'holder only');
    const kept = await keeperPut(fixture, { text: 'keeper only' });
    const returned = await run(fixture, 'keeper.return', { blobId: held.blobId });
    expect(problemOf(returned)).toMatchObject({ code: 'CAPABILITY_DENIED', retryable: false });
    expect(rows(fixture, "SELECT state, attempts FROM messages WHERE type = 'keeper.return'")).toEqual([{ state: 'failed', attempts: 0 }]);
    const gate = await start(fixture, 'holder.gate');
    await eventually(() => expect(rows(fixture, 'SELECT state FROM messages WHERE id = ?', gate)).toEqual([{ state: 'awaiting' }]));
    expect(problemOf(await run(fixture, 'holder.open', { commandId: gate, blobId: kept.blobId })).code).toBe('CAPABILITY_DENIED');
    expect(rows(fixture, 'SELECT state FROM messages WHERE id = ?', gate)).toEqual([{ state: 'awaiting' }]);
    expect(await query(fixture, 'keeper.point', { blobId: held.blobId }, undefined, workspaceA)).toMatchObject({ ok: false, problem: { code: 'CAPABILITY_DENIED' } });
  });

  it('M2.5-E11 admission checks every z.blobId() field for extension senders only', async () => {
    const held = await holderMake(fixture, 'holder only');
    expect(valueOf(await run(fixture, 'keeper.call', { blobId: held.blobId }))).toMatchObject({ code: 'CAPABILITY_DENIED' });
    expect(rows(fixture, "SELECT id FROM messages WHERE type = 'holder.take'")).toEqual([]);
    expect(problemOf(await run(fixture, 'keeper.share', { blobId: held.blobId })).code).toBe('CAPABILITY_DENIED');
    expect(rows(fixture, "SELECT id FROM events WHERE type = 'keeper.shared'")).toEqual([]);
    expect(valueOf(await command(fixture, 'holder.take', { blobId: held.blobId }, undefined, workspaceA))).toEqual({ text: 'holder only' });
  });
});
