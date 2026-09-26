import { describe, expect, it } from 'vitest';
import { collectBatch } from '../../src/index.ts';
import { blobRow, danglingRefs, hour, kept, openBlobFixture, putBytes, releaseAll } from './harness.ts';

describe('the blob store (plan 04 §4.6, ADR 0134)', () => {
  it('M2.5-H6 a GC run and a put of the same content never leave a reference to a missing file', async () => {
    const fixture = openBlobFixture();
    const old = await putBytes(fixture, 'same bytes');
    releaseAll(fixture, old.blobId);
    fixture.clock.now += 2 * hour;
    const intake = await fixture.store.intake();
    await intake.write(Buffer.from('same bytes', 'utf8'));
    const taken = await intake.finish();
    expect(fixture.store.collect()).toBe(1);
    expect([blobRow(fixture, old.blobId), fixture.files.exists(old.blobId)]).toEqual([false, false]);
    fixture.store.register(taken, { mime: 'text/plain' }, kept());
    expect([blobRow(fixture, old.blobId), fixture.files.exists(old.blobId)]).toEqual([true, true]);
    expect(danglingRefs(fixture)).toEqual([]);

    const second = await putBytes(fixture, 'other bytes');
    releaseAll(fixture, second.blobId);
    fixture.clock.now += 2 * hour;
    await putBytes(fixture, 'other bytes');
    fixture.store.collect();
    expect([blobRow(fixture, second.blobId), fixture.files.exists(second.blobId)]).toEqual([true, true]);
    expect(danglingRefs(fixture)).toEqual([]);
  });

  it('M2.5-E13 GC deletes expired references and old unreferenced blobs, in bounded batches', async () => {
    const fixture = openBlobFixture();
    const start = fixture.clock.now;
    const oldReleased = await putBytes(fixture, 'old released');
    const upload = await putBytes(fixture, 'upload', { owner: 'user', ws: '', ref: 'upload', expiresAt: start + 24 * hour });
    const pending = await putBytes(fixture, 'pending', { owner: '@acme/keeper', ws: '', ref: 'pending:m1', expiresAt: start + hour + hour });
    const spilled = await putBytes(fixture, 'spilled', { owner: 'kernel', ws: '', ref: 'payload:m2', expiresAt: null });
    releaseAll(fixture, oldReleased.blobId);
    fixture.clock.now = start + 90 * 60_000;
    const young = await putBytes(fixture, 'young released');
    releaseAll(fixture, young.blobId);
    fixture.clock.now = start + 25 * hour;
    const youngAgain = await putBytes(fixture, 'young again');
    releaseAll(fixture, youngAgain.blobId);
    fixture.clock.now += 30 * 60_000;
    expect(fixture.store.collect()).toBe(4);
    expect([oldReleased, upload, pending, young].map((blob) => blobRow(fixture, blob.blobId))).toEqual([false, false, false, false]);
    expect([blobRow(fixture, spilled.blobId), blobRow(fixture, youngAgain.blobId)]).toEqual([true, true]);
    expect(fixture.connection.prepare("SELECT ref FROM blob_refs ORDER BY ref").all()).toEqual([{ ref: 'payload:m2' }]);

    for (let index = 0; index <= collectBatch; index += 1) releaseAll(fixture, (await putBytes(fixture, `many ${index}`)).blobId);
    fixture.clock.now += 2 * hour;
    expect([fixture.store.collect(), fixture.store.collect(), fixture.store.collect()]).toEqual([collectBatch, 2, 0]);
    expect(fixture.files.temporaryFiles()).toEqual([]);
  });
});
