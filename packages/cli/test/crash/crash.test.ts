import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { api, childWait, jobOf, outputOf, queue, untilJob } from '../support/api.ts';
import { startKvman, type RunningKvman } from '../support/kvman-child.ts';
import { useSandbox, type Sandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

async function killed(kvman: RunningKvman): Promise<void> {
  kvman.process.kill('SIGKILL');
  expect(await kvman.exit).toBe('SIGKILL');
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

function killGroupAfter(world: Sandbox, pid: number): void {
  world.track(() => {
    if (isAlive(pid)) process.kill(process.platform === 'win32' ? pid : -pid, 'SIGKILL');
    return Promise.resolve();
  });
}

describe('crash invariants (12 §12.2)', { timeout: 90_000 }, () => {
  it('M1.8-H10 (1, 2) after a SIGKILL, queued and running jobs run again, one without retries ends failed, and an ended job never reruns', async () => {
    const world = sandbox();
    const first = await startKvman(world, ['--preset', world.appPreset({ 'kernel.workerConcurrency': 2 }, 'crash.json')]);
    await api(first.port).command('app.release', { gate: 'done' });
    const done = await queue(first.port, 'app.wait', { gate: 'done' });
    await untilJob(first.port, done, (job) => job.status === 'succeeded');
    const running = await queue(first.port, 'app.wait', { gate: 'running' });
    const once = await queue(first.port, 'app.wait-once', { gate: 'once' });
    await untilJob(first.port, running, (job) => job.status === 'running');
    await untilJob(first.port, once, (job) => job.status === 'running');
    const queued = await queue(first.port, 'app.wait', { gate: 'queued' });
    expect(await jobOf(first.port, queued)).toMatchObject({ status: 'queued' });
    await killed(first);
    const second = await startKvman(world, ['--preset', world.appPreset({}, 'restart.json')]);
    const calls = api(second.port);
    expect(await jobOf(second.port, once)).toMatchObject({ status: 'failed', problem: { code: 'INTERRUPTED' } });
    await calls.until('app.runs', { gate: 'running' }, (runs) => runs === 2);
    await calls.until('app.runs', { gate: 'queued' }, (runs) => runs === 1);
    await calls.command('app.release', { gate: 'running' });
    await calls.command('app.release', { gate: 'queued' });
    expect(await untilJob(second.port, running, (job) => job.status === 'succeeded')).toMatchObject({ attempts: 2 });
    await untilJob(second.port, queued, (job) => job.status === 'succeeded');
    expect(outputOf(await calls.query('app.runs', { gate: 'done' }))).toBe(1);
    expect(await jobOf(second.port, done)).toMatchObject({ status: 'succeeded', attempts: 1 });
  });

  it('M1.8-H10 (4) a SIGKILL during secrets writes leaves the old or the new secrets.json, never a partial one', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const calls = api(kvman.port);
    const set = (value: string) => calls.command('kernel.secrets.set', { extension: '@test/app', name: 'token', value });
    for (let index = 0; index < 20; index += 1) expect(await set(`value-${String(index)}`)).toMatchObject({ ok: true });
    const inFlight = Promise.allSettled([set('value-20')]);
    await killed(kvman);
    const [lastWrite] = await inFlight;
    const secrets = z.record(z.string(), z.record(z.string(), z.string())).parse(JSON.parse(readFileSync(path.join(world.home, 'secrets.json'), 'utf8')));
    const token = secrets['@test/app']?.['token'];
    if (lastWrite?.status === 'fulfilled') expect(token).toBe('value-20');
    else expect(['value-19', 'value-20']).toContain(token);
  });

  it('M1.8-H10 (6) a process left by a killed kvman is stopped at the next start', async () => {
    const world = sandbox();
    const preset = world.appPreset();
    const first = await startKvman(world, ['--preset', preset]);
    const { pid } = z.object({ pid: z.number() }).parse(outputOf(await api(first.port).command('app.sleeper', {})));
    killGroupAfter(world, pid);
    await killed(first);
    expect(isAlive(pid)).toBe(true);
    await startKvman(world, ['--preset', preset]);
    await vi.waitFor(() => expect(isAlive(pid)).toBe(false), childWait);
  });
});
