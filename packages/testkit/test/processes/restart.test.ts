import { processesListResultSchema } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { send } from '../adapters/http-client.ts';
import { launchKernel, temporaryHome } from '../child-kernel/launch.ts';
import { fixtureWorkspace } from '../child-kernel/workspace.ts';
import { faultTests } from '../faults/crash-harness.ts';
import { dataOf, exitsFor, gone, payloadOf, processRows, runner, runningRows } from './child-harness.ts';

const detachedSleep = { command: 'sleep', args: ['1000'], detached: true, onExit: 'runner.finish' };

describe('processes across kernel restarts (plan 03 §3.7, §3.9, ADR 0139)', faultTests, () => {
  it('M2.6-H1 a killed kernel leaves no orphan process after restart', async () => {
    const home = temporaryHome();
    const kernel = await launchKernel({ home, fixture: 'runner' });
    await runner(kernel.port, { spawn: detachedSleep });
    await runner(kernel.port, { spawn: { command: 'sleep', args: ['1000'] }, wait: true }, { wait: 0 });
    const original = await runningRows(home, 2);
    process.kill(kernel.pid, 'SIGKILL');
    expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
    const restarted = await launchKernel({ home, fixture: 'runner' });
    for (const row of original) await gone(row.pid);
    const after = processRows(home).filter((row) => original.some((before) => before.id === row.id));
    expect(after.map((row) => [row.state, row.reason])).toEqual([['killed', 'kernel-restart'], ['killed', 'kernel-restart']]);
    const listed = await send(restarted.port, 'POST', '/api/v1/queries/kernel.processes.list', { body: { payload: { state: 'running' }, workspaceId: fixtureWorkspace } });
    const running = processesListResultSchema.parse(dataOf(listed.json)).items.map((item) => item.processId);
    expect(running.filter((processId) => original.some((row) => row.id === processId))).toEqual([]);
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
  });

  it('M2.6-H6 a detached process delivers exactly one onExit when a kernel restart kills it', async () => {
    const home = temporaryHome();
    const kernel = await launchKernel({ home, fixture: 'runner' });
    await runner(kernel.port, { spawn: detachedSleep });
    const [row] = await runningRows(home, 1);
    process.kill(kernel.pid, 'SIGKILL');
    await kernel.exited;
    const restarted = await launchKernel({ home, fixture: 'runner' });
    const [exit] = await exitsFor(restarted.port, row?.id ?? '', 1);
    expect(payloadOf(exit)).toMatchObject({ reason: 'kernel-restart', exitCode: null, signal: null });
    expect(exit?.['message']).toMatchObject({ source: 'kernel', context: { locale: 'en' }, idempotencyKey: `${row?.id ?? ''}:exit` });
    expect(exit?.['log']).toBe('');
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
    const third = await launchKernel({ home, fixture: 'runner' });
    await exitsFor(third.port, row?.id ?? '', 1);
    expect(await third.stop()).toEqual({ code: 0, signal: null });
  });

  it('M2.6-E34 shutdown kills the groups, leaves the rows running, and the next boot sends onExit', async () => {
    const home = temporaryHome();
    const kernel = await launchKernel({ home, fixture: 'runner' });
    await runner(kernel.port, { spawn: detachedSleep });
    await runner(kernel.port, { spawn: { command: 'sleep', args: ['1000'] }, wait: true }, { wait: 0 });
    const original = await runningRows(home, 2);
    expect(await kernel.stop()).toEqual({ code: 0, signal: null });
    for (const row of original) await gone(row.pid);
    expect(processRows(home).map((row) => row.state)).toEqual(['running', 'running']);
    const restarted = await launchKernel({ home, fixture: 'runner' });
    const after = processRows(home).filter((row) => original.some((before) => before.id === row.id));
    expect(after.map((row) => [row.state, row.reason])).toEqual([['killed', 'kernel-restart'], ['killed', 'kernel-restart']]);
    const [detached, waiting] = original;
    await exitsFor(restarted.port, detached?.id ?? '', 1);
    await exitsFor(restarted.port, waiting?.id ?? '', 0);
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
  });
});
