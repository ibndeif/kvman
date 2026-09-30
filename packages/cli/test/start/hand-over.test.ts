import { realpathSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { api, outputOf } from '../support/api.ts';
import { runKvman, startKvman } from '../support/kvman-child.ts';
import { useSandbox } from '../support/sandbox.ts';

const sandbox = useSandbox();

const handedOver = /^kvman is already running; this folder is open at http:\/\/127\.0\.0\.1:(\d+)\/\?workspace=(\S+)\n$/;

describe('handing over to a running kvman (01 §1.2, ADR 0009, 44)', { timeout: 60_000 }, () => {
  it('M1.8-H2 a second kvman hands over its folder and exits 0; one with another preset fails KVMAN_RUNNING', async () => {
    const world = sandbox();
    const running = await startKvman(world, ['--preset', world.appPreset()]);
    const other = world.folder('other');
    const second = await runKvman(world, [], { cwd: other });
    expect(second.code).toBe(0);
    const [, port, workspaceId] = handedOver.exec(second.output) ?? [];
    expect(Number(port)).toBe(running.port);
    expect(outputOf(await api(running.port).query('kernel.workspace.list', {}))).toContainEqual({ id: workspaceId, name: 'other', path: realpathSync(other) });
    const two = world.writePreset('two.json', { name: 'two', extensions: {} });
    const third = await runKvman(world, ['--preset', two], { cwd: other });
    expect(third.code).toBe(1);
    expect(third.errors).toContain(`KVMAN_RUNNING: Another kvman (pid ${String(running.process.pid)}) runs the preset one on this home, not two.`);
  });

  it('M1.8-E7 a bare kvman (whose default preset differs), and one with the same --preset and --mode web, both hand over', async () => {
    const world = sandbox();
    const preset = world.appPreset();
    const running = await startKvman(world, ['--preset', preset]);
    const bare = await runKvman(world, ['--home', world.home, '--no-open'], { defaults: false });
    expect(bare.code).toBe(0);
    const same = await runKvman(world, ['--preset', preset, '--mode', 'web']);
    expect(same.code).toBe(0);
    expect(same.output).toContain(`http://127.0.0.1:${String(running.port)}/?workspace=${running.workspaceId}`);
  });

  it('M1.8-E8 handing over the user folder gives the URL of Home', async () => {
    const world = sandbox();
    const running = await startKvman(world, ['--preset', world.appPreset()]);
    const second = await runKvman(world, ['--mode', 'web'], { cwd: world.user });
    expect(second).toMatchObject({ code: 0, output: `kvman is already running; this folder is open at http://127.0.0.1:${String(running.port)}/?workspace=home\n` });
  });
});
