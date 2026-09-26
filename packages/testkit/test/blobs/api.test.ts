import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, workspaceA } from '../hosts/harness.ts';
import { command, problemOf, type InstallFixture } from '../install/harness.ts';
import { query, rows, run, start, valueOf } from '../workspaces/harness.ts';
import { blobTests, holderMake, keeperPut, openBlobFixture, refsOf, sha256 } from './harness.ts';

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openBlobFixture();
});
afterEach(async () => {
  await fixture.close();
});

const megabyte = 1024 * 1024;

function read(blobId: string, as: 'text' | 'bytes' | 'stream' | 'stat', global?: boolean): Promise<unknown> {
  return run(fixture, 'keeper.read', { blobId, as, ...(global === undefined ? {} : { global }) }).then(valueOf);
}

// The bytes a 3 MB stream from Keeper carries: each 1 MB chunk filled with its offset modulo 251.
function streamedBytes(size: number): Buffer {
  const bytes = Buffer.alloc(size);
  for (let offset = 0; offset < size; offset += megabyte) bytes.fill(offset % 251, offset, Math.min(size, offset + megabyte));
  return bytes;
}

describe('the blob API (plan 04 §4.3, §4.6, ADR 0134)', blobTests, () => {
  it('M2.5-E1 put and read round trip', async () => {
    const text = await keeperPut(fixture, { text: 'hello' });
    expect(text).toEqual({ blobId: sha256('hello'), size: 5, mime: 'text/plain' });
    const bytes = await keeperPut(fixture, { base64: Buffer.from([1, 2, 3]).toString('base64') });
    expect(bytes).toEqual({ blobId: sha256(Buffer.from([1, 2, 3])), size: 3, mime: 'application/octet-stream' });
    const expected = streamedBytes(3 * megabyte);
    const streamed = await keeperPut(fixture, { streamBytes: 3 * megabyte });
    expect(streamed).toEqual({ blobId: sha256(expected), size: 3 * megabyte, mime: 'application/octet-stream' });
    expect(await read(text.blobId, 'text')).toEqual({ value: 'hello' });
    expect(await read(bytes.blobId, 'bytes')).toEqual({ value: { length: 3, sha256: bytes.blobId } });
    expect(await read(streamed.blobId, 'stream')).toEqual({ value: { length: 3 * megabyte, sha256: streamed.blobId } });
    expect(await read(streamed.blobId, 'bytes')).toEqual({ value: { length: 3 * megabyte, sha256: streamed.blobId } });
    expect(await read(text.blobId, 'stat')).toEqual({ value: { size: 5, mime: 'text/plain' } });
    const unknown = sha256('never stored');
    expect(valueOf(await command(fixture, 'holder.stat', { blobId: unknown }, undefined, workspaceA))).toEqual({ stat: null });
  });

  it('M2.5-E2 the same bytes are stored once, and the first put metadata wins', async () => {
    const first = await keeperPut(fixture, { text: 'same', mime: 'text/markdown', name: 'a.txt' });
    const second = await keeperPut(fixture, { text: 'same', mime: 'text/plain', name: 'b.txt' });
    expect(second).toEqual(first);
    expect(first).toEqual({ blobId: sha256('same'), size: 4, mime: 'text/markdown', name: 'a.txt' });
    expect(rows(fixture, 'SELECT id FROM blobs WHERE id = ?', first.blobId)).toHaveLength(1);
    const folder = join(fixture.home, 'blobs', first.blobId.slice(0, 2), first.blobId.slice(2, 4));
    expect(readdirSync(folder)).toEqual([first.blobId]);
  });

  it('M2.5-E5 keep and release', async () => {
    const kept = await keeperPut(fixture, { text: 'to keep' });
    expect(valueOf(await command(fixture, 'holder.take', { blobId: kept.blobId, keep: true }, undefined, workspaceA))).toEqual({ text: 'to keep' });
    expect(refsOf(fixture, kept.blobId)).toContainEqual({ owner: '@acme/holder', ws: workspaceA, ref: `blob:${kept.blobId}`, expires_at: null });
    expect(valueOf(await run(fixture, 'holder.peek', { blobId: kept.blobId }))).toEqual({ value: 'to keep' });
    await run(fixture, 'holder.release', { blobId: kept.blobId });
    expect(valueOf(await run(fixture, 'holder.peek', { blobId: kept.blobId }))).toMatchObject({ code: 'CAPABILITY_DENIED' });
    const held = await holderMake(fixture, 'holder only');
    expect(problemOf(await run(fixture, 'keeper.keep', { blobId: held.blobId })).code).toBe('CAPABILITY_DENIED');
    expect(refsOf(fixture, held.blobId).map((ref) => ref['owner'])).toEqual(['@acme/holder']);
  });

  it('M2.5-E6 pending references end with their invocation', async () => {
    expect(problemOf(await run(fixture, 'keeper.fail', { text: 'failed put' })).code).toBe('keeper/BROKEN');
    expect(refsOf(fixture, sha256('failed put'))).toEqual([]);
    const slow = await start(fixture, 'keeper.slow', { text: 'slow put' });
    await eventually(() => expect(rows(fixture, "SELECT state FROM messages WHERE type = 'holder.gate'")).toEqual([{ state: 'awaiting' }]));
    const [claim] = rows(fixture, 'SELECT updated_at FROM messages WHERE id = ?', slow);
    expect(refsOf(fixture, sha256('slow put'))).toEqual([{ owner: '@acme/keeper', ws: workspaceA, ref: `pending:${slow}`, expires_at: Number(claim?.['updated_at']) + 3 * 3_600_000 + 3_600_000 }]);
    const [gate] = rows(fixture, "SELECT id FROM messages WHERE type = 'holder.gate'");
    await run(fixture, 'holder.open', { commandId: String(gate?.['id']) });
    expect(await fixture.runtime.awaitReply(slow)).toEqual({ ok: true, value: { blobId: sha256('slow put') } });
    expect(refsOf(fixture, sha256('slow put'))).toEqual([{ owner: '@acme/keeper', ws: workspaceA, ref: `blob:${sha256('slow put')}`, expires_at: null }]);
  });

  it('M2.5-E7 queries read blobs but cannot put, keep, or release', async () => {
    const kept = await keeperPut(fixture, { text: 'readable' });
    expect(await query(fixture, 'keeper.look', { blobId: kept.blobId }, undefined, workspaceA)).toEqual({ ok: true, value: { text: 'readable' } });
    const writes = await query(fixture, 'keeper.query.put', { blobId: kept.blobId }, undefined, workspaceA);
    expect(writes).toEqual({ ok: true, value: [{ code: 'CAPABILITY_DENIED' }, { code: 'CAPABILITY_DENIED' }, { code: 'CAPABILITY_DENIED' }] });
  });

  it('M2.5-E8 a handler without a workspace uses global blobs', async () => {
    expect(valueOf(await command(fixture, 'keeper.global.put', { text: 'global' }))).toEqual([
      { code: 'WORKSPACE_INVALID', hint: 'use ctx.store.global' }, { value: sha256('global') },
    ]);
    expect(refsOf(fixture, sha256('global'))).toEqual([{ owner: '@acme/keeper', ws: '', ref: `blob:${sha256('global')}`, expires_at: null }]);
    expect(await read(sha256('global'), 'text')).toEqual({ value: 'global' });
  });

  it('M2.5-E10 a blob that does not exist', async () => {
    const unknown = sha256('never stored');
    expect(problemOf(await command(fixture, 'holder.take', { blobId: unknown }, undefined, workspaceA)).code).toBe('BLOB_NOT_FOUND');
    expect(await read(unknown, 'text')).toMatchObject({ code: 'CAPABILITY_DENIED' });
  });
});
