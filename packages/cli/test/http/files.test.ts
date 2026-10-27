import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { api, outputOf, type Api } from '../support/api.ts';
import { startKvman } from '../support/kvman-child.ts';
import { useSandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

const problem = (code: string) => ({ ok: false, problem: expect.objectContaining({ code }) });
const fileAnswer = z.object({ ok: z.literal(true), file: z.object({ id: z.string(), type: z.string(), workspaceId: z.string() }) });

// A bytes body, which fetch sends without a Content-Type.
function upload(calls: Api, query: string, headers: Record<string, string> = {}): Promise<unknown> {
  return calls.fetch(`/api/files${query}`, { method: 'POST', headers, body: new TextEncoder().encode('bytes') }).then((response) => response.json());
}

async function openWorkspace(calls: Api, folder: string): Promise<string> {
  return z.object({ id: z.string() }).parse(outputOf(await calls.command('kernel.workspace.open', { path: folder }))).id;
}

describe('file routes (04 §4.1, ADR 0009, 37–39)', { timeout: 60_000 }, () => {
  it('M1.7-E8 an upload without workspaceId or name fails VALIDATION_FAILED, and into a closed workspace NOT_FOUND', async () => {
    const world = sandbox();
    const calls = api((await startKvman(world, ['--preset', world.appPreset()])).port);
    expect(await upload(calls, '?name=a.bin')).toEqual(problem('VALIDATION_FAILED'));
    expect(await upload(calls, '?workspaceId=home')).toEqual(problem('VALIDATION_FAILED'));
    const closed = await openWorkspace(calls, world.folder('closed'));
    await calls.command('kernel.workspace.close', { workspaceId: closed });
    expect(await upload(calls, `?workspaceId=${closed}&name=a.bin`)).toEqual(problem('NOT_FOUND'));
  });

  it('M1.7-E9 an upload without Content-Type is stored as application/octet-stream', async () => {
    const world = sandbox();
    const calls = api((await startKvman(world, ['--preset', world.appPreset()])).port);
    expect(fileAnswer.parse(await upload(calls, '?workspaceId=home&name=a.bin')).file.type).toBe('application/octet-stream');
    expect(fileAnswer.parse(await upload(calls, '?workspaceId=home&name=a.txt', { 'content-type': 'text/plain' })).file.type).toBe('text/plain');
  });

  it("M1.7-E11 a download without workspaceId fails VALIDATION_FAILED, and of another workspace's file NOT_FOUND", async () => {
    const world = sandbox();
    const calls = api((await startKvman(world, ['--preset', world.appPreset()])).port);
    const { id } = fileAnswer.parse(await upload(calls, '?workspaceId=home&name=a.bin')).file;
    expect(await (await calls.fetch(`/api/files/${id}`)).json()).toEqual(problem('VALIDATION_FAILED'));
    const other = await openWorkspace(calls, world.folder('other'));
    expect(await (await calls.fetch(`/api/files/${id}?workspaceId=${other}`)).json()).toEqual(problem('NOT_FOUND'));
    const download = await calls.fetch(`/api/files/${id}?workspaceId=home`);
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(await download.text()).toBe('bytes');
  });

  it('M5.4-H8 and M5.4-E9 a download answers one byte range, refuses one past the end, and gives the whole file otherwise', async () => {
    const world = sandbox();
    const calls = api((await startKvman(world, ['--preset', world.appPreset()])).port);
    const bytes = Uint8Array.from({ length: 1000 }, (_, index) => index % 256);
    const stored = await calls.fetch('/api/files?workspaceId=home&name=v.mp4', { method: 'POST', headers: { 'content-type': 'video/mp4' }, body: bytes }).then((response) => response.json());
    const { id } = fileAnswer.parse(stored).file;
    const fetchRange = (range?: string) => calls.fetch(`/api/files/${id}?workspaceId=home`, range === undefined ? {} : { headers: { range } });
    for (const [range, first, last] of [['bytes=0-99', 0, 99], ['bytes=900-', 900, 999], ['bytes=-100', 900, 999]] as const) {
      const part = await fetchRange(range);
      expect(part.status).toBe(206);
      expect(part.headers.get('content-range')).toBe(`bytes ${String(first)}-${String(last)}/1000`);
      expect(part.headers.get('content-length')).toBe(String(last - first + 1));
      expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([...bytes.slice(first, last + 1)]);
    }
    for (const range of [undefined, 'bytes=0-1,5-9', 'bytes=9-1', 'items=0-9']) {
      const whole = await fetchRange(range);
      expect(whole.status).toBe(200);
      expect(whole.headers.get('accept-ranges')).toBe('bytes');
      expect(whole.headers.get('content-disposition')).toContain('attachment');
      expect(whole.headers.get('x-content-type-options')).toBe('nosniff');
      expect((await whole.arrayBuffer()).byteLength).toBe(1000);
    }
    for (const range of ['bytes=1000-', 'bytes=-0']) {
      const refused = await fetchRange(range);
      expect(refused.status).toBe(416);
      expect(refused.headers.get('content-range')).toBe('bytes */1000');
      expect((await refused.arrayBuffer()).byteLength).toBe(0);
    }
  });
});
