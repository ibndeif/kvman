import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { command } from '../adapters/http-client.ts';
import { launchKernel, temporaryHome } from '../child-kernel/launch.ts';
import { fixtureWorkspace, workspaceFolderOf } from '../child-kernel/workspace.ts';
import { checkProcessInvariant, exitsFor, gone, payloadOf, processRows, runner, runningRows } from '../processes/child-harness.ts';
import { faultTests } from './crash-harness.ts';
import { inspect } from './ledger-database.ts';

// A request to a kernel killed while it answers ends without a reply.
async function unanswered(request: Promise<unknown>): Promise<void> {
  await request.then(() => undefined, () => undefined);
}

describe('crashes around a process (plan 14 §14.3, invariants 5 and 13)', faultTests, () => {
  it('M2.6-E32 process.after-spawn-before-release: the command never runs, and boot ends its row with one onExit', async () => {
    const home = temporaryHome();
    const marker = join(workspaceFolderOf(home), 'ran');
    const kernel = await launchKernel({ home, fixture: 'runner', faults: 'process.after-spawn-before-release' });
    await unanswered(runner(kernel.port, { spawn: { command: 'sh', args: ['-c', `touch ${marker}; sleep 1000`], detached: true, onExit: 'runner.finish' } }));
    expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
    const [crashed] = processRows(home);
    if (crashed === undefined) throw new Error('the process was not recorded before the crash');
    await gone(crashed.pid);
    expect(existsSync(marker)).toBe(false);
    const restarted = await launchKernel({ home, fixture: 'runner' });
    const [exit] = await exitsFor(restarted.port, crashed.id, 1);
    expect(payloadOf(exit)).toMatchObject({ reason: 'kernel-restart' });
    expect(processRows(home).find((row) => row.id === crashed.id)).toMatchObject({ state: 'killed', reason: 'kernel-restart' });
    checkProcessInvariant(home);
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
  });

  it('M2.6-E33 process.after-release and process.after-exit-before-onexit: each process gets exactly one onExit', async () => {
    for (const { faults, spawn, log } of [
      { faults: 'process.after-release', spawn: { command: 'sleep', args: ['1000'] }, log: '' },
      { faults: 'process.after-exit-before-onexit', spawn: { command: 'echo', args: ['out'] }, log: 'out\n' },
    ]) {
      const home = temporaryHome();
      const kernel = await launchKernel({ home, fixture: 'runner', faults });
      await unanswered(runner(kernel.port, { spawn: { ...spawn, detached: true, onExit: 'runner.finish' } }));
      expect(await kernel.exited, faults).toEqual({ code: null, signal: 'SIGKILL' });
      const [crashed] = processRows(home);
      if (crashed === undefined) throw new Error(`nothing was recorded before ${faults}`);
      const restarted = await launchKernel({ home, fixture: 'runner' });
      await gone(crashed.pid);
      const [exit] = await exitsFor(restarted.port, crashed.id, 1);
      expect(payloadOf(exit), faults).toMatchObject({ reason: 'kernel-restart' });
      expect(exit?.['log'], faults).toBe(log);
      expect(await restarted.stop()).toEqual({ code: 0, signal: null });
      const again = await launchKernel({ home, fixture: 'runner' });
      await exitsFor(again.port, crashed.id, 1);
      checkProcessInvariant(home);
      expect(await again.stop()).toEqual({ code: 0, signal: null });
    }
  });

  it('M2.6-E37 workspace.forget.after-cancel: the redelivered forget finishes and leaves no process of the workspace', async () => {
    const home = temporaryHome();
    const kernel = await launchKernel({ home, fixture: 'runner', faults: 'workspace.forget.after-cancel' });
    await runner(kernel.port, { spawn: { command: 'sleep', args: ['1000'], detached: true, onExit: 'runner.finish' } });
    const [spawned] = await runningRows(home, 1);
    await unanswered(command(kernel.port, 'kernel.workspace.forget', { workspaceId: fixtureWorkspace }, { workspaceId: undefined, wait: 10_000 }));
    expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
    await gone(spawned?.pid ?? 0);
    const restarted = await launchKernel({ home, fixture: 'runner' });
    await inspectUntilForgotten(home);
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
    inspect(home, (connection) => {
      expect(connection.prepare('SELECT id FROM processes').all()).toEqual([]);
      expect(connection.prepare('SELECT id FROM messages WHERE workspace_id = ?').all(fixtureWorkspace)).toEqual([]);
      expect(connection.prepare('SELECT workspace_id FROM workspace_presets WHERE workspace_id = ?').all(fixtureWorkspace)).toEqual([]);
      expect(connection.prepare("SELECT ref FROM blob_refs WHERE ref LIKE 'process:%'").all()).toEqual([]);
    });
  });
});

async function inspectUntilForgotten(home: string): Promise<void> {
  await vi.waitFor(() => {
    expect(inspect(home, (connection) => connection.prepare('SELECT id FROM workspaces WHERE id = ?').all(fixtureWorkspace))).toEqual([]);
  }, { timeout: 20_000, interval: 50 });
}
