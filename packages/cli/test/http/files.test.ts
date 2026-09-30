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
});
