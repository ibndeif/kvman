import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { commandReplyResponseSchema, kernelPorts, problemSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonTests, healthOf, kvman, lockOf, processAlive, spawnKvman, temporaryFolder } from './cli.ts';

const started: string[] = [];

afterEach(async () => {
  for (const home of started.splice(0)) await kvman(['stop', '--home', home]);
});

async function start(home: string, ...flags: string[]): Promise<Awaited<ReturnType<typeof kvman>>> {
  started.push(home);
  return kvman(['start', '--home', home, ...flags]);
}

function runningLine(port: number, home: string): string {
  return `kvman is running at http://127.0.0.1:${port} (home ${home})\n`;
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function post(port: number, type: string, payload: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/api/v1/commands/${type}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ payload, idempotencyKey: crypto.randomUUID() }),
  });
}

describe('kvman start, stop, and status (plan 03 §3.9–§3.10, 12 §12.5, ADRs 0087, 0088, 0096, 0097)', daemonTests, () => {
  it('M1.8-H1 a second kvman start fails DAEMON_CONFLICT', async () => {
    const home = join(temporaryFolder(), 'home');
    expect((await start(home)).code).toBe(0);
    const { nonce, port } = lockOf(home);
    const again = await start(home);
    expect([again.code, again.stderr]).toEqual([1, 'DAEMON_CONFLICT: Another kernel owns this home folder\n']);
    expect((await healthOf(port)).instanceId).toBe(nonce);
  });

  it('M1.8-H2 a stale lock is taken over', async () => {
    const home = join(temporaryFolder(), 'home');
    mkdirSync(home);
    const exited = Number(execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }));
    const stale = { pid: exited, processStart: 'Mon Jan 1 00:00:00 2024', nonce: crypto.randomUUID(), port: 4199, startedAt: 1 };
    writeFileSync(join(home, 'daemon.lock'), JSON.stringify(stale));
    const run = await start(home);
    const lock = lockOf(home);
    expect([run.code, run.stdout]).toEqual([0, runningLine(lock.port, home)]);
    expect(lock.nonce).not.toBe(stale.nonce);
    expect(processAlive(lock.pid)).toBe(true);
    const health = await healthOf(lock.port);
    expect([health.instanceId, health.processStart]).toEqual([lock.nonce, lock.processStart]);
  });

  it('M1.8-H3 a home folder with other files and no kvman.db is refused HOME_INVALID', async () => {
    const home = temporaryFolder();
    writeFileSync(join(home, 'notes.txt'), 'mine');
    const run = await start(home);
    expect(run.code).toBe(1);
    expect(run.stderr.startsWith('HOME_INVALID: The home folder holds other files\n')).toBe(true);
    expect(readdirSync(home)).toEqual(['notes.txt']);
  });

  it('M1.8-H4 kvman start returns once /health answers while the daemon keeps running', async () => {
    const home = join(temporaryFolder(), 'missing', 'home');
    const run = await start(home);
    const lock = lockOf(home);
    expect([run.code, run.stdout]).toEqual([0, runningLine(lock.port, home)]);
    const health = await healthOf(lock.port);
    expect(health).toMatchObject({ status: 'ok', instanceId: lock.nonce, processStart: lock.processStart, port: lock.port, home });
    const status = await kvman(['status', '--home', home]);
    expect(status.code).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({ status: 'ok', instanceId: lock.nonce, port: lock.port, home });
  });

  it('M1.8-H9 a second kernel in another home starts on the next free port, and the CLI finds each through its lock', async () => {
    const first = join(temporaryFolder(), 'a');
    const second = join(temporaryFolder(), 'b');
    expect((await start(first)).code).toBe(0);
    expect((await start(second)).code).toBe(0);
    const [lockA, lockB] = [lockOf(first), lockOf(second)];
    expect(lockA.port).not.toBe(lockB.port);
    for (const port of [lockA.port, lockB.port]) expect(port >= kernelPorts.from && port <= kernelPorts.to).toBe(true);
    for (const [home, lock] of [[first, lockA], [second, lockB]] as const) {
      const status = await kvman(['status', '--home', home]);
      expect(JSON.parse(status.stdout)).toMatchObject({ home, port: lock.port, instanceId: lock.nonce });
    }
  });

  it('M1.8-H10 a POST with a foreign Origin fails HOST_FORBIDDEN while a POST without Origin succeeds', async () => {
    const home = join(temporaryFolder(), 'home');
    expect((await start(home)).code).toBe(0);
    const { port } = lockOf(home);
    const foreign = await post(port, 'kernel.cancel', { messageId: '01JAZ3K4M5N6P7Q8R9S0T1V2W3' }, { origin: 'https://evil.example' });
    expect([foreign.status, problemSchema.parse(await foreign.json()).code]).toEqual([403, 'HOST_FORBIDDEN']);
    const plain = await post(port, 'kernel.cancel', { messageId: '01JAZ3K4M5N6P7Q8R9S0T1V2W3' });
    expect(plain.status).toBe(200);
    expect(commandReplyResponseSchema.parse(await plain.json()).reply).toEqual({ cancelled: 0 });
  });

  it('M1.8-E13 two starts at once on one home: exactly one runs', async () => {
    const home = join(temporaryFolder(), 'home');
    const runs = await Promise.all([start(home), start(home)]);
    expect(runs.map((run) => run.code).sort()).toEqual([0, 1]);
    const lost = runs.find((run) => run.code === 1);
    expect(lost?.stderr.startsWith('DAEMON_CONFLICT: ')).toBe(true);
    const lock = lockOf(home);
    expect((await healthOf(lock.port)).instanceId).toBe(lock.nonce);
  });

  it('M1.8-E15 --port binds exactly that port, without fallback', async () => {
    const port = await freePort();
    const first = join(temporaryFolder(), 'a');
    const second = join(temporaryFolder(), 'b');
    const run = await start(first, '--port', String(port));
    expect([run.code, run.stdout]).toEqual([0, runningLine(port, first)]);
    const refused = await start(second, '--port', String(port));
    expect(refused.code).toBe(1);
    expect(refused.stderr.startsWith('PORT_UNAVAILABLE: No port is free for the kernel\n')).toBe(true);
    expect(existsSync(join(second, 'daemon.lock'))).toBe(false);
  });

  it('M1.8-E21 kvman stop stops the daemon through kernel.shutdown', async () => {
    const home = join(temporaryFolder(), 'home');
    expect((await start(home)).code).toBe(0);
    const { pid } = lockOf(home);
    const stop = await kvman(['stop', '--home', home]);
    expect([stop.code, stop.stdout]).toEqual([0, 'kvman stopped\n']);
    expect(existsSync(join(home, 'daemon.lock'))).toBe(false);
    await expect.poll(() => processAlive(pid)).toBe(false);
    const status = await kvman(['status', '--home', home]);
    expect([status.code, status.stdout]).toEqual([1, 'kvman is not running\n']);
    const again = await kvman(['stop', '--home', home]);
    expect([again.code, again.stdout]).toEqual([0, 'kvman is not running\n']);
  });

  it('M1.8-E22 SIGTERM shuts a foreground daemon down, repeated signals are harmless', async () => {
    const home = join(temporaryFolder(), 'home');
    const child = spawnKvman(['start', '--foreground', '--home', home]);
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
    await expect.poll(() => stdout.includes('kvman is running at'), { timeout: 20_000 }).toBe(true);
    const lock = lockOf(home);
    expect((await healthOf(lock.port)).instanceId).toBe(lock.nonce);
    process.kill(lock.pid, 'SIGTERM');
    process.kill(lock.pid, 'SIGTERM');
    expect(await exited).toBe(0);
    expect(existsSync(join(home, 'daemon.lock'))).toBe(false);
    expect(processAlive(lock.pid)).toBe(false);
    expect(stdout).toContain('"msg":"kernel started"');
    expect(stdout).toContain('"msg":"kernel stopped"');
  });
});
