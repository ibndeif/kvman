import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runKvman, startKvman } from '../support/kvman-child.ts';
import { useSandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

function deadPid(): number {
  return spawnSync(process.execPath, ['-e', '']).pid;
}

async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return typeof address === 'object' && address !== null ? address.port : 0;
}

function writeLock(home: string, lock: object): string {
  mkdirSync(home, { recursive: true });
  const file = path.join(home, 'kvman.lock');
  writeFileSync(file, JSON.stringify(lock));
  return file;
}

describe('kvman.lock (01 §1.3, ADR 0009, 43)', { timeout: 60_000 }, () => {
  it('M1.8-H3 a lock whose process is not alive is replaced', async () => {
    const world = sandbox();
    const file = writeLock(world.home, { pid: deadPid(), port: 4000 });
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ pid: kvman.process.pid, port: kvman.port });
  });

  it('M1.8-E5 a live lock without a port, or whose port does not answer, fails KVMAN_RUNNING and is kept', async () => {
    const world = sandbox();
    const preset = world.appPreset();
    const starting = writeLock(world.home, { pid: process.pid });
    const whileStarting = await runKvman(world, ['--preset', preset]);
    expect(whileStarting.code).toBe(1);
    expect(whileStarting.errors).toContain(`KVMAN_RUNNING: Another kvman (pid ${String(process.pid)}) is still starting on this home.`);
    expect(JSON.parse(readFileSync(starting, 'utf8'))).toEqual({ pid: process.pid });
    const port = await closedPort();
    writeLock(world.home, { pid: process.pid, port });
    const silent = await runKvman(world, ['--preset', preset]);
    expect(silent.code).toBe(1);
    expect(silent.errors).toContain(`KVMAN_RUNNING: Another kvman (pid ${String(process.pid)}) holds this home's lock, but it doesn't answer on port ${String(port)}.`);
    expect(JSON.parse(readFileSync(starting, 'utf8'))).toEqual({ pid: process.pid, port });
  });

  it('M1.8-E10 a start that fails after taking the lock exits 1 with a hint, and removes the lock', async () => {
    const world = sandbox();
    world.writeExtension({ name: '@test/broken', namespace: 'broken', entry: "export default () => { throw new Error('broken on purpose'); };" });
    const preset = world.writePreset('broken.json', { name: 'broken', extensions: { '@test/broken': 'path:./broken' }, settings: { 'kernel.workers': 1 } });
    const result = await runKvman(world, ['--preset', preset]);
    expect(result.code).toBe(1);
    expect(result.errors).toMatch(/^EXTENSION_INVALID: .*broken on purpose/m);
    expect(result.errors).toContain('Fix the extension or remove it from the preset.');
    expect(existsSync(path.join(world.home, 'kvman.lock'))).toBe(false);
  });
});
