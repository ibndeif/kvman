import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { command, send } from '../adapters/http-client.ts';
import { launchKernel, temporaryHome } from '../child-kernel/launch.ts';
import { faultTests } from './crash-harness.ts';
import { inspect } from './ledger-database.ts';

// A request to a kernel killed while it answers ends without a reply.
async function unanswered(request: Promise<unknown>): Promise<void> {
  await request.then(() => undefined, () => undefined);
}

function blobPath(home: string, blobId: string): string {
  return join(home, 'blobs', blobId.slice(0, 2), blobId.slice(2, 4), blobId);
}

describe('a crash around a blob put (plan 14 §14.3, invariant 9)', faultTests, () => {
  it('M2.5-E15 blob.put.after-file-before-ref: the redelivered put completes and no reference points to a missing file', async () => {
    const home = temporaryHome();
    const kernel = await launchKernel({ home, fixture: 'keeper', faults: 'blob.put.after-file-before-ref' });
    await unanswered(command(kernel.port, 'keeper.put', { text: 'survives a crash' }, { idempotencyKey: 'put-e15', wait: 10_000 }));
    expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
    const restarted = await launchKernel({ home, fixture: 'keeper' });
    let messageId = '';
    await vi.waitFor(async () => {
      const again = await command(restarted.port, 'keeper.put', { text: 'survives a crash' }, { idempotencyKey: 'put-e15', wait: 5_000 });
      expect(again.status).toBe(200);
      messageId = String(Object(again.json)['id']);
    }, { timeout: 30_000, interval: 100 });
    const status = await send(restarted.port, 'GET', `/api/v1/messages/${messageId}`);
    expect(status.json).toMatchObject({ state: 'done', reply: { value: { size: 16, mime: 'text/plain' } } });
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
    inspect(home, (connection) => {
      const refs = connection.prepare('SELECT blob_id, ref, expires_at FROM blob_refs').all();
      for (const ref of refs) {
        const blobId = String(ref['blob_id']);
        expect(connection.prepare('SELECT id FROM blobs WHERE id = ?').get(blobId), blobId).toBeDefined();
        expect(existsSync(blobPath(home, blobId)), blobId).toBe(true);
      }
      expect(refs.filter((ref) => String(ref['ref']).startsWith('pending:'))).toEqual([]);
    });
    const temporary = join(home, 'blobs', 'tmp');
    expect(existsSync(temporary) ? readdirSync(temporary) : []).toEqual([]);
  });
});
