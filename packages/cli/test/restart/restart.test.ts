import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { api, outputOf } from '../support/api.ts';
import { startKvman, stopKvman } from '../support/kvman-child.ts';
import { useSandbox } from '../support/sandbox.ts';
import { notesProject, nthPort, portsOf } from './support.ts';

const sandbox = useSandbox();

const lockOf = (home: string): { pid: number; port: number } => JSON.parse(readFileSync(path.join(home, 'kvman.lock'), 'utf8')) as { pid: number; port: number };

describe('restarting kvman (02 §2.14, ADR 0024, 1 to 3)', { timeout: 120_000 }, () => {
  it('QA36-H6, QA36-H7, QA36-H10, and QA37-H12 a restart applies a project installed by its folder, listed under its package name, keeps the lock and the workspaces, and deletes the backup', async () => {
    const world = sandbox();
    const preset = world.appPreset();
    const kvman = await startKvman(world, ['--preset', preset]);
    const second = outputOf(await api(kvman.port).command('kernel.workspace.open', { path: world.folder('second') })) as { id: string };
    const lockBefore = lockOf(world.home);
    await api(kvman.port).command('kernel.extensions.install', { source: `path:${notesProject(world)}` });
    expect(existsSync(`${preset}.good`)).toBe(true);
    expect(outputOf(await api(kvman.port).command('kernel.restart', {}))).toEqual({ restarting: true });

    const port = await nthPort(kvman, 2);
    expect(kvman.output()).toContain('kvman is restarting…');
    expect(lockOf(world.home)).toEqual({ pid: lockBefore.pid, port });
    expect(outputOf(await api(port).query('notes.ping', {}))).toEqual({ text: 'pong' });
    expect((outputOf(await api(port).query('kernel.extensions.list', {})) as { name: string }[]).map((extension) => extension.name)).toContain('@test/notes');
    expect((outputOf(await api(port).query('kernel.workspace.list', {})) as { id: string }[]).map((workspace) => workspace.id)).toContain(second.id);
    expect(existsSync(`${preset}.good`)).toBe(false);
    expect(await stopKvman(kvman)).toBe(0);
  });

  it('QA36-E1 two requests before the stop make one restart', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const calls = api(kvman.port);
    const [first, second] = await Promise.all([calls.command('kernel.restart', {}), calls.command('kernel.restart', {})]);
    expect([outputOf(first), outputOf(second)]).toEqual([{ restarting: true }, { restarting: true }]);
    await nthPort(kvman, 2);
    expect(kvman.output().match(/kvman is restarting…/g)).toHaveLength(1);
    expect(portsOf(kvman)).toHaveLength(2);
    expect(await stopKvman(kvman)).toBe(0);
  });

  it('QA36-E7 Ctrl+C after a restart stops kvman with exit code 0 and removes the lock', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    await api(kvman.port).command('kernel.restart', {});
    await nthPort(kvman, 2);
    expect(await stopKvman(kvman)).toBe(0);
    expect(existsSync(path.join(world.home, 'kvman.lock'))).toBe(false);
  });

  it('QA36-E8 a restart stops the processes extensions started', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const calls = api(kvman.port);
    await calls.command('app.sleeper', {});
    const [sleeper] = outputOf(await calls.query('kernel.processes.list', {})) as { pid: number; name: string }[];
    expect(sleeper?.name).toBe('sleeper');
    await calls.command('kernel.restart', {});
    const port = await nthPort(kvman, 2);
    expect(outputOf(await api(port).query('kernel.processes.list', {}))).toEqual([]);
    expect(() => process.kill(sleeper?.pid ?? 0, 0)).toThrow();
    expect(await stopKvman(kvman)).toBe(0);
  });

  it('QA36-E9 a request from a foreign origin restarts nothing', async () => {
    const world = sandbox();
    const kvman = await startKvman(world, ['--preset', world.appPreset()]);
    const answer = await fetch(`http://127.0.0.1:${String(kvman.port)}/api/commands/kernel.restart`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.com' },
      body: JSON.stringify({ input: {} }),
    });
    expect(await answer.json()).toEqual({ ok: false, problem: { code: 'FORBIDDEN_ORIGIN', message: expect.any(String) } });
    expect(outputOf(await api(kvman.port).query('kernel.health.get', {}))).toMatchObject({ preset: 'one' });
    expect(kvman.output()).not.toContain('kvman is restarting…');
    expect(await stopKvman(kvman)).toBe(0);
  });
});
