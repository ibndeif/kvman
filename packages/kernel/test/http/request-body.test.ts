import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCallBody, readCapped, writeCapped } from '../../src/http/request-body.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

// A body of chunks that counts how many were read, as a client streaming it would see.
function streamed(chunks: string[]): { request: Request; pulled: () => number } {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pulled];
      pulled += 1;
      if (chunk === undefined) controller.close();
      else controller.enqueue(new TextEncoder().encode(chunk));
    },
  });
  return { request: new Request('http://127.0.0.1/', { method: 'POST', body, duplex: 'half' }), pulled: () => pulled };
}

const tooLarge = (limit: number) => expect.objectContaining({ problem: expect.objectContaining({ code: 'TOO_LARGE', params: { limit } }) });

describe('request bodies (04 §4.1, ADR 0009, 40)', () => {
  it('M1.7-E2 a body over the limit fails TOO_LARGE by its Content-Length or its bytes, and the rest is never read', async () => {
    const declared = new Request('http://127.0.0.1/', { method: 'POST', body: 'x'.repeat(20), headers: { 'content-length': '20' } });
    await expect(readCapped(declared, 10)).rejects.toThrow(tooLarge(10));
    const body = streamed(['12345', '67890', 'abcde', 'fghij', 'klmno']);
    await expect(readCapped(body.request, 12)).rejects.toThrow(tooLarge(12));
    expect(body.pulled()).toBeLessThan(5);
    expect((await readCapped(streamed(['12345', '67890']).request, 10)).toString()).toBe('1234567890');
  });

  it('M1.7-E3 a body that is not JSON, or of the wrong shape, is refused', () => {
    const bytes = (text: string) => new TextEncoder().encode(text);
    expect(parseCallBody(bytes('{nope'), 'command')).toEqual({ kind: 'not-json' });
    for (const [text, kind] of [['{"input":{},"extra":1}', 'command'], ['{"workspaceId":"home"}', 'command'], ['{"input":{},"async":true}', 'query']] as const) {
      expect(parseCallBody(bytes(text), kind)).toMatchObject({ kind: 'invalid', problem: { code: 'VALIDATION_FAILED' } });
    }
    expect(parseCallBody(bytes('{"input":{"a":1},"async":true}'), 'command')).toEqual({ kind: 'call', call: { input: { a: 1 }, workspaceId: undefined, async: true } });
    expect(parseCallBody(bytes('{"input":null,"workspaceId":"w"}'), 'query')).toEqual({ kind: 'call', call: { input: null, workspaceId: 'w', async: false } });
  });

  it('M1.7-E10 a streamed body over its limit leaves no file behind', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'kvman-upload-'));
    folders.push(folder);
    const kept = path.join(folder, 'kept');
    await writeCapped(streamed(['hello ', 'world']).request, 20, kept);
    expect(readFileSync(kept, 'utf8')).toBe('hello world');
    const dropped = path.join(folder, 'dropped');
    await expect(writeCapped(streamed(['hello ', 'world']).request, 8, dropped)).rejects.toThrow(tooLarge(8));
    expect(existsSync(dropped)).toBe(false);
  });
});
