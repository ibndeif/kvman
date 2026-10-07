import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { workspaceSchema, z } from '@kvman/sdk';
import { api, jobOf, outputOf, queue, untilJob } from '../support/api.ts';
import { startKvman, stopKvman } from '../support/kvman-child.ts';
import { useSandbox } from '../support/sandbox.ts';
import { closeInput, linesOf, nthLine, portOf, send, spawnPiped } from './support.ts';

const sandbox = useSandbox();
const workspacesSchema = z.array(workspaceSchema);

describe('a piped run (14 §14.2, ADR 0038, 16 to 20)', { timeout: 120_000 }, () => {
  it('M3.1-H1 kvman --pipe writes one running line and nothing else', async () => {
    const world = sandbox();
    const kvman = spawnPiped(world, ['--preset', world.appPreset()]);
    const port = portOf(await nthLine(kvman, 1));
    const workspaces = workspacesSchema.parse(outputOf(await api(port).query('kernel.workspace.list', {})));
    const start = workspaces.find((workspace) => workspace.path === realpathSync(world.start));
    expect(linesOf(kvman)).toEqual([{ kind: 'running', url: `http://127.0.0.1:${String(port)}/?workspace=${start?.id ?? ''}`, port }]);
    expect(kvman.output()).toBe(`${JSON.stringify(linesOf(kvman)[0])}\n`);
  });

  it('M3.1-H2 closing the input stops kvman as the first Ctrl+C does', async () => {
    const world = sandbox();
    const preset = world.appPreset();
    const first = spawnPiped(world, ['--preset', preset]);
    const port = portOf(await nthLine(first, 1));
    const retried = await queue(port, 'app.wait', { gate: 'retried' });
    const once = await queue(port, 'app.wait-once', { gate: 'once' });
    await api(port).until('app.waiting', { gate: 'retried' }, (waiting) => waiting === true);
    await api(port).until('app.waiting', { gate: 'once' }, (waiting) => waiting === true);
    closeInput(first);
    expect(await first.exit).toBe(0);
    expect(existsSync(path.join(world.home, 'kvman.lock'))).toBe(false);
    const second = await startKvman(world, ['--preset', preset]);
    expect(await jobOf(second.port, once)).toMatchObject({ status: 'failed', attempts: 1, problem: { code: 'INTERRUPTED' } });
    await api(second.port).until('app.runs', { gate: 'retried' }, (runs) => runs === 2);
    await api(second.port).command('app.release', { gate: 'retried' });
    expect(await untilJob(second.port, retried, (job) => job.status === 'succeeded')).toMatchObject({ attempts: 2 });
  });

  it('M3.1-H3 an input that closes while kvman starts lets the start finish', async () => {
    const world = sandbox();
    const kvman = spawnPiped(world, ['--preset', world.appPreset()]);
    closeInput(kvman);
    expect(await kvman.exit).toBe(0);
    expect(linesOf(kvman)).toEqual([{ kind: 'running', url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/\?workspace=\S+$/), port: expect.any(Number) }]);
    expect(existsSync(path.join(world.home, 'kvman.lock'))).toBe(false);
  });

  it('M3.1-H9 kernel.restart writes restarting, then running', async () => {
    const world = sandbox();
    const kvman = spawnPiped(world, ['--preset', world.appPreset()]);
    const port = portOf(await nthLine(kvman, 1));
    await api(port).command('kernel.restart', {});
    const again = portOf(await nthLine(kvman, 3));
    expect(linesOf(kvman).map((line) => line.kind)).toEqual(['running', 'restarting', 'running']);
    expect(linesOf(kvman)[1]).toEqual({ kind: 'restarting' });
    expect(outputOf(await api(again).query('kernel.health.get', {}))).toMatchObject({ mode: 'web' });
    closeInput(kvman);
    expect(await kvman.exit).toBe(0);
  });

  it('M3.1-H11 without --pipe, a closed input does not stop kvman', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const waiting = await queue(kvman.port, 'app.wait', { gate: 'open' });
    await api(kvman.port).until('app.waiting', { gate: 'open' }, (held) => held === true);
    closeInput(kvman);
    await api(kvman.port).command('app.release', { gate: 'open' });
    expect(await untilJob(kvman.port, waiting, (job) => job.status === 'succeeded')).toMatchObject({ attempts: 1 });
    expect(outputOf(await api(kvman.port).query('kernel.health.get', {}))).toMatchObject({ mode: 'web' });
    expect(kvman.output()).toBe(`kvman is running at ${kvman.url}\n`);
    expect(await stopKvman(kvman)).toBe(0);
  });

  it('M3.1-E9 a line when no question is open is ignored', async () => {
    const world = sandbox();
    const kvman = spawnPiped(world, ['--preset', world.appPreset()]);
    const port = portOf(await nthLine(kvman, 1));
    const waiting = await queue(port, 'app.wait', { gate: 'open' });
    await api(port).until('app.waiting', { gate: 'open' }, (held) => held === true);
    send(kvman, '{"trust":true}');
    send(kvman, 'nonsense');
    await api(port).command('app.release', { gate: 'open' });
    expect(await untilJob(port, waiting, (job) => job.status === 'succeeded')).toMatchObject({ attempts: 1 });
    expect(linesOf(kvman)).toHaveLength(1);
    closeInput(kvman);
    expect(await kvman.exit).toBe(0);
  });

  it('M3.1-E10 a signal still stops a piped kvman whose input is open', async () => {
    const world = sandbox();
    const kvman = spawnPiped(world, ['--preset', world.appPreset()]);
    await nthLine(kvman, 1);
    expect(await stopKvman(kvman)).toBe(0);
    expect(existsSync(path.join(world.home, 'kvman.lock'))).toBe(false);
  });
});
