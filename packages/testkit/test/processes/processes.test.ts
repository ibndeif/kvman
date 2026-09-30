import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { processOwner, reloadWait, revisionOf, scripts, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const infoSchema = z.object({ name: z.string(), pid: z.number(), startedAt: z.string() });
const problem = (code: string) => ({ problem: { code } });

describe('processes (02 §2.16)', () => {
  it('M1.6-H12 a process logs its output, survives a reload, triggers kernel.process.exited, and a second start fails', async () => {
    const kernel = await harness.start([processOwner]);
    const flag = path.join(harness.temporaryFolder(), 'exit-now');
    const started = infoSchema.parse(await kernel.exec('p.start', { name: 'server', args: ['-e', scripts.untilFlag, flag] }));
    await vi.waitFor(async () => expect(await kernel.exec('p.log', { name: 'server' })).toBe('hello'), reloadWait);
    await expect(kernel.exec('p.start', { name: 'server', args: ['-e', scripts.forever] })).rejects.toMatchObject(problem('PROCESS_RUNNING'));
    writeFileSync(path.join(harness.folder('@test/p'), 'index.ts'), `${processOwner.entry}\n// edited\n`);
    await vi.waitFor(async () => expect(await revisionOf(kernel, '@test/p')).toBe(1), reloadWait);
    expect(await kernel.exec('p.list', {})).toEqual([started]);
    writeFileSync(flag, 'now');
    await vi.waitFor(async () => expect(await kernel.exec('p.list', {})).toEqual([]), reloadWait);
    await kernel.clock.advance(0);
    expect(await kernel.exec('p.exited-get', {})).toEqual([{ extension: '@test/p', workspaceId: 'home', name: 'server', exitCode: 3, signal: null }]);
  });

  it('M1.6-E28 a query cannot start or stop a process, and a name must be kebab case', async () => {
    const kernel = await harness.start([processOwner]);
    await expect(kernel.exec('p.start-in-query', {})).rejects.toMatchObject(problem('READ_ONLY'));
    await expect(kernel.exec('p.stop-in-query', {})).rejects.toMatchObject(problem('READ_ONLY'));
    await expect(kernel.exec('p.start', { name: '../x', args: ['-e', scripts.forever] })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
  });

  it('M1.6-E31 the same name runs in two workspaces, each with its own log', async () => {
    const kernel = await harness.start([processOwner]);
    const workspace = await kernel.exec('kernel.workspace.open', { path: harness.temporaryFolder() });
    await kernel.exec('p.start', { name: 'twin', args: ['-e', scripts.forever] });
    await kernel.exec('p.start', { name: 'twin', args: ['-e', scripts.forever] }, { workspaceId: workspace.id });
    const listed = await kernel.exec('kernel.processes.list', {});
    expect(listed.map((entry) => [entry.extension, entry.workspaceId, entry.name]).sort()).toEqual(
      [['@test/p', 'home', 'twin'], ['@test/p', workspace.id, 'twin']].sort(),
    );
    for (const workspaceId of ['home', workspace.id]) {
      expect(existsSync(path.join(kernel.home, 'logs', 'processes', '@test', 'p', workspaceId, 'twin.log'))).toBe(true);
    }
  });

  it('M1.6-E38 a command that cannot start fails VALIDATION_FAILED and keeps no log', async () => {
    const kernel = await harness.start([processOwner]);
    await expect(kernel.exec('p.start', { name: 'ghost', command: 'kvman-no-such-command', args: [] })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    expect(existsSync(path.join(kernel.home, 'logs', 'processes', '@test', 'p', 'home', 'ghost.log'))).toBe(false);
    await expect(kernel.exec('p.log', { name: 'ghost' })).rejects.toMatchObject(problem('NOT_FOUND'));
  });
});
