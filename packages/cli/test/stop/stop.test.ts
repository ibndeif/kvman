import { existsSync } from 'node:fs';
import { Agent, request } from 'node:http';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { api, childWait, jobOf, queue, untilJob } from '../support/api.ts';
import { startKvman, stopKvman } from '../support/kvman-child.ts';
import { useSandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

// Asks for `route` on one kept-alive connection, again each time an answer ends, until kvman closes the connection.
// `opened` resolves once the first answer has started; `closed` with how many answers ended.
function askAgain(port: number, route: string): { opened: Promise<void>; closed: Promise<number> } {
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  let answers = 0;
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const closed = new Promise<number>((resolve) => {
    const ask = (): void => {
      const asked = request({ host: '127.0.0.1', port, path: route, agent }, (response) => {
        open();
        response.resume();
        response.once('end', () => {
          answers += 1;
          ask();
        });
      });
      asked.once('error', () => {
        agent.destroy();
        resolve(answers);
      });
      asked.end();
    };
    ask();
  });
  return { opened, closed };
}

describe('stopping kvman (02 §2.14, ADR 0009, 50)', { timeout: 90_000 }, () => {
  it('M1.8-H8 Ctrl+C fails unfinished attempts with INTERRUPTED, and a job with retries left runs again', async () => {
    const world = sandbox();
    const preset = world.appPreset();
    const first = await startKvman(world, ['--preset', preset]);
    const retried = await queue(first.port, 'app.wait', { gate: 'retried' });
    const once = await queue(first.port, 'app.wait-once', { gate: 'once' });
    await api(first.port).until('app.waiting', { gate: 'retried' }, (waiting) => waiting === true);
    await api(first.port).until('app.waiting', { gate: 'once' }, (waiting) => waiting === true);
    expect(await stopKvman(first)).toBe(0);
    const second = await startKvman(world, ['--preset', preset]);
    expect(await jobOf(second.port, once)).toMatchObject({ status: 'failed', attempts: 1, problem: { code: 'INTERRUPTED' } });
    await api(second.port).until('app.runs', { gate: 'retried' }, (runs) => runs === 2);
    await api(second.port).command('app.release', { gate: 'retried' });
    expect(await untilJob(second.port, retried, (job) => job.status === 'succeeded')).toMatchObject({ attempts: 2 });
  });

  it('M1.8-E20 SIGTERM runs the stop sequence, exits 0, and removes the lock', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    expect(await stopKvman(kvman, 'SIGTERM')).toBe(0);
    expect(existsSync(path.join(world.home, 'kvman.lock'))).toBe(false);
  });

  it('QA79-E1 a client that asks again on its kept-alive connection, as an open page does, does not hold kvman open after SIGTERM', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const job = await queue(kvman.port, 'app.wait', { gate: 'held' });
    await api(kvman.port).until('app.waiting', { gate: 'held' }, (waiting) => waiting === true);
    const asking = askAgain(kvman.port, `/api/jobs/${job}/stream`);
    await asking.opened;
    expect(await stopKvman(kvman, 'SIGTERM')).toBe(0);
    expect(await asking.closed).toBeGreaterThanOrEqual(1);
  });

  it('M1.8-E21 a second SIGINT while a kernel.stopping handler waits exits 130 at once, and removes the lock', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    await api(kvman.port).command('app.hold-stopping', {});
    kvman.process.kill('SIGINT');
    await vi.waitFor(() => expect(kvman.errors()).toContain('INFO app holds the stop.'), childWait);
    kvman.process.kill('SIGINT');
    expect(await kvman.exit).toBe(130);
    expect(existsSync(path.join(world.home, 'kvman.lock'))).toBe(false);
  });
});
