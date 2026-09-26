import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { send, type HttpAnswer } from '../adapters/http-client.ts';
import { workspaceA } from '../hosts/harness.ts';
import type { InstallFixture } from '../install/harness.ts';
import { serveHttp, type ServedFixture } from '../isolation/harness.ts';
import { blobTests, openBlobFixture, refsOf, sha256 } from './harness.ts';

let fixture: InstallFixture;
let served: ServedFixture;
beforeEach(async () => {
  fixture = await openBlobFixture();
  served = await serveHttp(fixture);
});
afterEach(async () => {
  await served.close();
  await fixture.close();
});

const sandbox = "sandbox; default-src 'none'";

function put(bytes: Buffer, headers: Record<string, string> = {}): Promise<HttpAnswer> {
  return send(served.port, 'PUT', '/api/v1/blobs', { rawBody: bytes, headers });
}

async function uploaded(bytes: Buffer, mime: string, name?: string): Promise<string> {
  const answer = await put(bytes, { 'content-type': mime, ...(name === undefined ? {} : { 'x-kvman-filename': encodeURIComponent(name) }) });
  expect(answer.status).toBe(200);
  return sha256(bytes);
}

function served_(answer: HttpAnswer): { type: unknown; disposition: unknown } {
  expect([answer.headers['x-content-type-options'], answer.headers['content-security-policy']]).toEqual(['nosniff', sandbox]);
  return { type: answer.headers['content-type'], disposition: answer.headers['content-disposition'] };
}

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const gif = Buffer.from('GIF89a\u0001\u0000\u0001\u0000\u0000\u0000', 'latin1');
const webp = Buffer.from('RIFF\u0010\u0000\u0000\u0000WEBPVP8 ', 'latin1');

describe('the blob HTTP endpoints (plan 12 §12.2, 13 §13.7, ADR 0138)', blobTests, () => {
  it('M2.5-H4 an SVG upload is served as an attachment', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8');
    const answer = await put(svg, { 'content-type': 'image/svg+xml', 'x-kvman-filename': 'logo.svg' });
    expect(answer).toMatchObject({ status: 200, json: { blobId: sha256(svg), size: svg.byteLength, mime: 'image/svg+xml', name: 'logo.svg' } });
    const fetched = await send(served.port, 'GET', `/api/v1/blobs/${sha256(svg)}`);
    expect(fetched.status).toBe(200);
    expect(fetched.text).toBe(svg.toString('utf8'));
    expect(served_(fetched)).toEqual({ type: 'application/octet-stream', disposition: "attachment; filename*=UTF-8''logo.svg" });
  });

  it('M2.5-E20 PUT /blobs headers and limits', async () => {
    const plain = await put(Buffer.from('no type'));
    expect(plain.json).toEqual({ blobId: sha256('no type'), size: 7, mime: 'application/octet-stream' });
    expect(refsOf(fixture, sha256('no type'))).toEqual([{ owner: 'user', ws: '', ref: 'upload', expires_at: fixture.timers.time.value + 24 * 3_600_000 }]);
    const named = await put(Buffer.from('named'), { 'content-type': 'text/plain; charset=utf-8', 'x-kvman-filename': '%D9%85%D9%84%D9%81.txt', 'x-kvman-workspace': workspaceA });
    expect(named.json).toEqual({ blobId: sha256('named'), size: 5, mime: 'text/plain', name: 'ملف.txt' });
    expect(refsOf(fixture, sha256('named'))).toEqual([{ owner: 'user', ws: workspaceA, ref: 'upload', expires_at: fixture.timers.time.value + 24 * 3_600_000 }]);
    for (const headers of [{ 'x-kvman-filename': '%E0%A4%A' }, { 'x-kvman-filename': 'a%2Fb' }, { 'content-type': 'not a type' }, { 'x-kvman-workspace': 'nope' }]) {
      expect(await put(Buffer.from('bad'), headers), JSON.stringify(headers)).toMatchObject({ status: 400, json: { code: 'VALIDATION_FAILED' } });
    }
    expect(await put(Buffer.from('lost'), { 'x-kvman-workspace': 'c'.repeat(64) })).toMatchObject({ status: 422, json: { code: 'WORKSPACE_INVALID' } });
    const oversized = await put(Buffer.alloc(100 * 1024 * 1024 + 1));
    expect(oversized).toMatchObject({ status: 413, json: { code: 'BLOB_TOO_LARGE', params: { max: 104857600 } } });
    expect(fixture.runtime.files.files.temporaryFiles()).toEqual([]);
    expect(await put(Buffer.from('foreign'), { origin: 'http://evil.example' })).toMatchObject({ status: 403, json: { code: 'HOST_FORBIDDEN' } });
  });

  it('M2.5-E21 GET /blobs/:id serving policy', async () => {
    const get = (blobId: string, query = ''): Promise<HttpAnswer> => send(served.port, 'GET', `/api/v1/blobs/${blobId}${query}`);
    for (const [bytes, mime] of [[png, 'image/png'], [jpeg, 'image/jpeg'], [gif, 'image/gif'], [webp, 'image/webp']] as const) {
      expect(served_(await get(await uploaded(bytes, mime))), mime).toEqual({ type: mime, disposition: 'inline' });
    }
    expect(served_(await get(await uploaded(Buffer.from('مرحبا', 'utf8'), 'text/plain')))).toEqual({ type: 'text/plain; charset=utf-8', disposition: 'inline' });
    const attachments: Array<[Buffer, string]> = [
      [Buffer.from('<html><script>alert(1)</script></html>'), 'text/html'], [Buffer.from('%PDF-1.7'), 'application/pdf'],
      [Buffer.from('<html>spoof</html>'), 'image/png'], [Buffer.from('a\u0000b'), 'text/plain'],
    ];
    for (const [bytes, mime] of attachments) expect(served_(await get(await uploaded(bytes, mime))), mime).toEqual({ type: 'application/octet-stream', disposition: 'attachment' });
    expect(served_(await get(sha256(png), '?download=1'))).toEqual({ type: 'application/octet-stream', disposition: 'attachment' });
    expect(await get(sha256('never stored'))).toMatchObject({ status: 404, json: { code: 'BLOB_NOT_FOUND' } });
    expect(await get('ABC')).toMatchObject({ status: 400, json: { code: 'VALIDATION_FAILED' } });
  });
});
