import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InstallFixture } from '../install/harness.ts';
import { rows, run, valueOf } from '../workspaces/harness.ts';
import { blobTests, keeperPut, openBlobFixture } from './harness.ts';

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openBlobFixture('shared');
});
afterEach(async () => {
  await fixture.close();
});

const megabyte = 1024 * 1024;

describe('blob size limits (plan 04 §4.3, 13 §13.7, ADR 0134)', blobTests, () => {
  it('M2.5-E9 a put over 100 MB fails, and reads over 16 MB need a stream', async () => {
    const before = rows(fixture, 'SELECT id FROM blobs').length;
    expect(valueOf(await run(fixture, 'keeper.put', { streamBytes: 100 * megabyte + 1 }))).toMatchObject({ code: 'BLOB_TOO_LARGE', params: { max: 104857600 } });
    expect(rows(fixture, 'SELECT id FROM blobs')).toHaveLength(before);
    expect(rows(fixture, 'SELECT blob_id FROM blob_refs')).toHaveLength(0);
    expect(fixture.runtime.files.files.temporaryFiles()).toEqual([]);
    const large = await keeperPut(fixture, { streamBytes: 16 * megabyte + 1 });
    for (const as of ['text', 'bytes'] as const) {
      expect(valueOf(await run(fixture, 'keeper.read', { blobId: large.blobId, as }))).toEqual({
        code: 'BLOB_TOO_LARGE', params: { max: 16777216 }, hint: expect.stringContaining('ctx.store.blobs.stream'),
      });
    }
    expect(valueOf(await run(fixture, 'keeper.read', { blobId: large.blobId, as: 'stream' }))).toEqual({ value: { length: 16 * megabyte + 1, sha256: large.blobId } });
  });
});
