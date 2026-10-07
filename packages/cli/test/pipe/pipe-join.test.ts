import { realpathSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { describe, expect, it } from 'vitest';
import { api, outputOf } from '../support/api.ts';
import { runKvman, startKvman, stopKvman } from '../support/kvman-child.ts';
import { useSandbox, type Sandbox } from '../support/sandbox.ts';
import { linesOfText } from './support.ts';

const sandbox = useSandbox();

async function takenPort(world: Sandbox): Promise<number> {
  const server: Server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  world.track(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  return typeof address === 'object' && address !== null ? address.port : 0;
}

function onPort(world: Sandbox, port: number, preset: string): string[] {
  return ['--home', world.home, '--no-open', '--yes', '--pipe', '--port', String(port), '--preset', preset];
}

describe('joining and failing in a piped run (14 §14.2)', { timeout: 120_000 }, () => {
  it('M3.1-H7 a second kvman --pipe writes joined, or failed with KVMAN_RUNNING', async () => {
    const world = sandbox();
    const running = await startKvman(world, ['--preset', world.appPreset()]);
    const other = world.folder('other');
    const second = await runKvman(world, ['--pipe'], { cwd: other });
    expect(second.code).toBe(0);
    const workspaces = outputOf(await api(running.port).query('kernel.workspace.list', {}));
    expect(workspaces).toContainEqual({ id: expect.any(String), name: 'other', path: realpathSync(other) });
    const [joined] = linesOfText(second.output);
    expect(linesOfText(second.output)).toHaveLength(1);
    expect(joined).toEqual({ kind: 'joined', url: expect.stringMatching(new RegExp(`^http://127\\.0\\.0\\.1:${String(running.port)}/\\?workspace=[0-9a-f-]+$`)), port: running.port });
    const two = world.writePreset('two.json', { name: 'two', extensions: {} });
    const third = await runKvman(world, ['--pipe', '--preset', two], { cwd: other });
    expect(third.code).toBe(1);
    expect(linesOfText(third.output)).toEqual([{ kind: 'failed', problem: expect.objectContaining({ code: 'KVMAN_RUNNING', message: expect.stringContaining('runs the preset one') }) }]);
  });

  it('M3.1-H8 a taken port writes failed with PORT_IN_USE and the language', async () => {
    const world = sandbox();
    const port = await takenPort(world);
    const result = await runKvman(world, onPort(world, port, world.appPreset()), { defaults: false });
    expect(result.code).toBe(1);
    expect(linesOfText(result.output)).toEqual([{ kind: 'failed', language: 'en', problem: { code: 'PORT_IN_USE', message: `The port ${String(port)} is already in use.`, params: { port } } }]);
  });

  it('M3.1-E7 the failed line carries the global language', async () => {
    const world = sandbox();
    const preset = world.appPreset();
    const earlier = await startKvman(world, ['--preset', preset]);
    outputOf(await api(earlier.port).command('kernel.settings.set', { key: 'kernel.language', value: 'ar', scope: 'global' }));
    expect(await stopKvman(earlier)).toBe(0);
    const result = await runKvman(world, onPort(world, await takenPort(world), preset), { defaults: false });
    expect(result.code).toBe(1);
    expect(linesOfText(result.output)).toEqual([expect.objectContaining({ kind: 'failed', language: 'ar', problem: expect.objectContaining({ code: 'PORT_IN_USE' }) })]);
  });

  it('M3.1-E8 a preset that cannot be read fails with no language, and stderr is as before', async () => {
    const world = sandbox();
    const result = await runKvman(world, ['--pipe', '--preset', './missing.json']);
    expect(result.code).toBe(1);
    expect(linesOfText(result.output)).toEqual([{ kind: 'failed', problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) }]);
    expect(result.errors).toContain('VALIDATION_FAILED: ');
    expect(result.errors).toContain('Check the flags (kvman --help), the preset, and its settings.');
  });
});
