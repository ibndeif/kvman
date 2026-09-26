import { EventLog } from '@kvman/kernel';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { command as httpCommand, send } from '../adapters/http-client.ts';
import { eventually, workspaceA } from '../hosts/harness.ts';
import type { InstallFixture } from '../install/harness.ts';
import { serveHttp } from '../isolation/harness.ts';
import { admission, rows, run, start, valueOf } from '../workspaces/harness.ts';
import { blobTests, infoOf, kvOf, openBlobFixture, refsOf, sha256 } from './harness.ts';

let fixture: InstallFixture;
beforeEach(async () => {
  fixture = await openBlobFixture();
});
afterEach(async () => {
  await fixture.close();
});

const kilobytes = 1024;
const blobIdPattern = /^[0-9a-f]{64}$/;

function row(id: string): Record<string, unknown> {
  const [found] = rows(fixture, 'SELECT payload, payload_ref, result, result_ref FROM messages WHERE id = ?', id);
  if (found === undefined) throw new Error(`no message ${id}`);
  return found;
}

describe('payload, result, and event spill (plan 02 §2.2, ADRs 0055, 0135)', blobTests, () => {
  it('M2.5-E17 a large payload, result, or event spills to a kernel blob', async () => {
    const text = 'p'.repeat(300 * kilobytes);
    const put = await start(fixture, 'keeper.put', { text });
    expect(infoOf(valueOf(await fixture.runtime.awaitReply(put)))).toMatchObject({ blobId: sha256(text), size: 300 * kilobytes });
    const payloadRef = String(row(put)['payload_ref']);
    expect(row(put)).toMatchObject({ payload: null, payload_ref: expect.stringMatching(blobIdPattern) });
    expect(refsOf(fixture, payloadRef)).toContainEqual({ owner: 'kernel', ws: workspaceA, ref: `payload:${put}`, expires_at: null });

    const echo = await start(fixture, 'keeper.echo', { size: 300 * kilobytes });
    expect(await fixture.runtime.awaitReply(echo)).toEqual({ ok: true, value: { text: 'r'.repeat(300 * kilobytes) } });
    const resultRef = String(row(echo)['result_ref']);
    expect(row(echo)).toMatchObject({ result: null, result_ref: expect.stringMatching(blobIdPattern) });
    expect(refsOf(fixture, resultRef)).toEqual([{ owner: 'kernel', ws: workspaceA, ref: `result:${echo}`, expires_at: null }]);
    const served = await serveHttp(fixture);
    try {
      const answer = await httpCommand(served.port, 'keeper.echo', { size: 300 * kilobytes });
      expect(answer).toMatchObject({ status: 200, json: { reply: { text: 'r'.repeat(300 * kilobytes) } } });
      const status = await send(served.port, 'GET', `/api/v1/messages/${echo}`);
      expect(status.json).toEqual({ id: echo, type: 'keeper.echo', state: 'done', reply: { text: 'r'.repeat(300 * kilobytes) } });
    } finally {
      await served.close();
    }

    await run(fixture, 'keeper.announce', { size: 300 * kilobytes });
    const [event] = rows(fixture, "SELECT id, seq, payload, payload_ref FROM events WHERE type = 'keeper.announced'");
    expect(event).toMatchObject({ payload: null, payload_ref: expect.stringMatching(blobIdPattern) });
    const eventRefs = refsOf(fixture, String(event?.['payload_ref'])).map((ref) => String(ref['ref']));
    expect(eventRefs).toContain(`event:${String(event?.['id'])}`);
    expect(eventRefs.filter((ref) => ref.startsWith('payload:'))).toHaveLength(1);
    await eventually(() => expect(kvOf(fixture, '@acme/holder', 'announced')).toBe(300 * kilobytes));
    const resumed = new EventLog({ connection: fixture.connection, files: fixture.runtime.files.files }).after(Number(event?.['seq']) - 1);
    expect(resumed[0]?.event.payload).toEqual({ text: 'e'.repeat(300 * kilobytes) });
  });

  it('M2.5-E18 spill limits and small values', async () => {
    const small = await start(fixture, 'keeper.put', { text: 'x'.repeat(256 * kilobytes - 100) });
    await fixture.runtime.awaitReply(small);
    expect(row(small)).toMatchObject({ payload: expect.any(String), payload_ref: null });
    expect(refsOf(fixture, sha256(String(row(small)['payload'])))).toEqual([]);
    expect(await admission(fixture, 'keeper.put', { text: 'x'.repeat(16 * 1024 * kilobytes + 1) })).toBe('PAYLOAD_TOO_LARGE');
  });

  it('M2.5-E19 spilled blobs are never collected while their row exists', async () => {
    const text = 'q'.repeat(300 * kilobytes);
    const put = await start(fixture, 'keeper.put', { text });
    await fixture.runtime.awaitReply(put);
    const payloadRef = String(row(put)['payload_ref']);
    for (let step = 0; step < 18; step += 1) {
      fixture.timers.advance(10 * 60_000);
      await fixture.runtime.files.collector.idle();
    }
    expect(rows(fixture, 'SELECT id FROM blobs WHERE id = ?', payloadRef)).toHaveLength(1);
    expect(JSON.parse(fixture.runtime.files.files.readSync(payloadRef).toString('utf8'))).toEqual({ text });
  });
});
