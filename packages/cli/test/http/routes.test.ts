import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { api, childWait, outputOf, queue, untilJob } from '../support/api.ts';
import { startKvman } from '../support/kvman-child.ts';
import { useSandbox, type Sandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

const jobId = /^[0-9a-f-]{36}$/;
const withoutJobId = (code: string) => ({ ok: false, problem: expect.objectContaining({ code }) });

// The job id of the sync call to `name` that HTTP started, from the debug log.
function startedJobId(world: Sandbox, name: string): string | undefined {
  const lines = readFileSync(path.join(world.home, 'logs', 'kvman.log'), 'utf8').trim().split('\n');
  const records = lines.map((line) => z.object({ msg: z.string(), name: z.string().optional(), jobId: z.string().optional() }).parse(JSON.parse(line)));
  return records.find((record) => record.msg === 'An HTTP call started a job.' && record.name === name)?.jobId;
}

describe('the call routes (04 §4.1)', { timeout: 60_000 }, () => {
  it('M1.7-H1 every route answers as §4 says', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const calls = api(kvman.port);
    expect(await calls.command('app.echo', { text: 'hi' })).toEqual({ ok: true, output: { text: 'hi' }, jobId: expect.stringMatching(jobId) });
    const queued = await queue(kvman.port, 'app.echo', { text: 'later' });
    expect(await untilJob(kvman.port, queued, (job) => job.status === 'succeeded')).toMatchObject({ attempts: 1 });
    expect(await calls.query('app.answer', {})).toEqual({ ok: true, output: { answer: 42 }, jobId: expect.stringMatching(jobId) });
    const waiting = await queue(kvman.port, 'app.wait', { gate: 'held' });
    await untilJob(kvman.port, waiting, (job) => job.status === 'running');
    expect(await (await calls.fetch(`/api/jobs/${waiting}/cancel`, { method: 'POST' })).json()).toEqual({ ok: true });
    await untilJob(kvman.port, waiting, (job) => job.status === 'cancelled');
    const uploaded = await (await calls.fetch('/api/files?workspaceId=home&name=note.txt', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello file' })).json();
    const file = z.object({ ok: z.literal(true), file: z.object({ id: z.string(), name: z.literal('note.txt'), type: z.literal('text/plain'), size: z.literal(10) }) }).parse(uploaded).file;
    expect(await (await calls.fetch(`/api/files/${file.id}?workspaceId=home`)).text()).toBe('hello file');
    expect(await (await calls.fetch('/api/locales/ar')).json()).toMatchObject({ ok: true, catalog: { 'app.title': 'تطبيق' } });
    expect(await (await calls.fetch('/')).text()).toBe('<!doctype html><title>app</title>');
    expect(await (await calls.fetch('/web/app/nested/page.js')).text()).toBe('export const page = 1;');
  });

  it('M1.7-H5 a sync call whose client disconnects ends cancelled', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const calls = api(kvman.port);
    const leaving = new AbortController();
    const call = calls.fetch('/api/commands/app.wait', { method: 'POST', body: JSON.stringify({ input: { gate: 'left' } }), signal: leaving.signal });
    await calls.until('app.waiting', { gate: 'left' }, (waiting) => waiting === true);
    leaving.abort();
    await expect(call).rejects.toThrow();
    await calls.until('app.cancelled', {}, (records) => z.array(z.object({ name: z.string() })).parse(records).some((record) => record.name === 'app.wait'));
  });

  it('M1.7-E1 a route mismatch, an unknown name, and a private name fail without a jobId', async () => {
    const world = sandbox();
    const calls = api((await startKvman(world, ['--preset', world.appPreset()])).port);
    expect(await calls.command('app.answer', {})).toEqual(withoutJobId('NOT_FOUND'));
    expect(await calls.query('app.echo', { text: 'x' })).toEqual(withoutJobId('NOT_FOUND'));
    expect(await calls.command('app.nothing', {})).toEqual(withoutJobId('NOT_FOUND'));
    expect(await calls.command('app.hidden', {})).toEqual(withoutJobId('NOT_PUBLIC'));
  });

  it('M2.2-E19 a sync-only command answers a sync call, and refuses async: true without a job', async () => {
    const world = sandbox();
    const calls = api((await startKvman(world, ['--preset', world.appPreset()])).port);
    expect(await calls.command('app.vault', { gate: 'x' })).toEqual({ ok: true, output: {}, jobId: expect.stringMatching(jobId) });
    const queued = await calls.fetch('/api/commands/app.vault', { method: 'POST', body: JSON.stringify({ input: { gate: 'x' }, async: true }) });
    expect(await queued.json()).toEqual(withoutJobId('VALIDATION_FAILED'));
  });

  it('M1.7-E4 an input that fails its schema carries its jobId; a closed workspace is NOT_FOUND without one', async () => {
    const world = sandbox();
    const calls = api((await startKvman(world, ['--preset', world.appPreset()])).port);
    expect(await calls.command('app.echo', { text: 5 })).toEqual({ ok: false, problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }), jobId: expect.stringMatching(jobId) });
    const { id } = z.object({ id: z.string() }).parse(outputOf(await calls.command('kernel.workspace.open', { path: world.folder('closing') })));
    expect(await calls.command('kernel.workspace.close', { workspaceId: id })).toMatchObject({ ok: true });
    expect(await calls.command('app.echo', { text: 'x' }, { workspaceId: id })).toEqual(withoutJobId('NOT_FOUND'));
  });

  it('M1.7-E5 a sync call still waiting for a worker slot when its client disconnects never runs, and is recorded cancelled', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset({ 'kernel.workerConcurrency': 1 }), '--log-level', 'debug']);
    const calls = api(kvman.port);
    const blocker = await queue(kvman.port, 'app.wait', { gate: 'block' });
    await untilJob(kvman.port, blocker, (job) => job.status === 'running');
    const leaving = new AbortController();
    const call = calls.fetch('/api/commands/app.wait', { method: 'POST', body: JSON.stringify({ input: { gate: 'never' } }), signal: leaving.signal });
    const waitingCall = await vi.waitFor(() => z.string().parse(startedJobId(world, 'app.wait')), childWait);
    leaving.abort();
    await expect(call).rejects.toThrow();
    expect(await (await calls.fetch(`/api/jobs/${blocker}/cancel`, { method: 'POST' })).json()).toEqual({ ok: true });
    await calls.until('app.cancelled', {}, (records) => z.array(z.object({ jobId: z.string() })).parse(records).some((record) => record.jobId === waitingCall));
    expect(outputOf(await calls.query('app.runs', { gate: 'never' }))).toBe(0);
  });

  it('M1.7-E20 an unknown /api route is the NOT_FOUND envelope (status 200), and a missing web file a plain 404', async () => {
    const world = sandbox();
    const calls = api((await startKvman(world, ['--preset', world.appPreset()])).port);
    const unknown = await calls.fetch('/api/nothing');
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toEqual(withoutJobId('NOT_FOUND'));
    const missing = await calls.fetch('/web/app/missing.js');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).not.toContain('json');
  });

  it('M1.7-E21 a language no catalog has is NOT_FOUND', async () => {
    const world = sandbox();
    const calls = api((await startKvman(world, ['--preset', world.appPreset()])).port);
    expect(await (await calls.fetch('/api/locales/de')).json()).toEqual(withoutJobId('NOT_FOUND'));
  });
});
