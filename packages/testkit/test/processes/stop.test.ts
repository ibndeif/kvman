import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { alive, processOwner, reloadWait, scripts, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const infoSchema = z.object({ pid: z.number() });
// Starts a child of its own, prints the child's pid, and waits.
const withChild = `const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, ['-e', ${JSON.stringify(scripts.forever)}], { stdio: 'ignore' });
  console.log(child.pid); ${scripts.forever}`;
const ignoresTerm = `process.on('SIGTERM', () => {}); console.log('ready'); ${scripts.forever}`;

describe('stopping processes (02 §2.16)', () => {
  it('M1.6-E29 stop ends the process and its children, without kernel.process.exited', async () => {
    const kernel = await harness.start([processOwner]);
    const { pid } = infoSchema.parse(await kernel.exec('p.start', { name: 'parent', args: ['-e', withChild] }));
    await vi.waitFor(async () => expect(await kernel.exec('p.log', { name: 'parent' })).toMatch(/^\d+$/), reloadWait);
    const childPid = Number(await kernel.exec('p.log', { name: 'parent' }));
    await kernel.exec('p.stop', { name: 'parent' });
    expect(alive(pid)).toBe(false);
    await vi.waitFor(() => expect(alive(childPid)).toBe(false), reloadWait);
    expect(await kernel.exec('p.list', {})).toEqual([]);
    await kernel.clock.advance(0);
    expect(await kernel.exec('p.exited-get', {})).toEqual([]);
    await expect(kernel.exec('p.stop', { name: 'parent' })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
  });

  it('M1.6-E30 a process that ignores SIGTERM is killed after 5 s on Linux and macOS, at once on Windows', async () => {
    const kernel = await harness.start([processOwner]);
    const { pid } = infoSchema.parse(await kernel.exec('p.start', { name: 'stubborn', args: ['-e', ignoresTerm] }));
    await vi.waitFor(async () => expect(await kernel.exec('p.log', { name: 'stubborn' })).toBe('ready'), reloadWait);
    const before = Date.now();
    await kernel.exec('p.stop', { name: 'stubborn' });
    const took = Date.now() - before;
    expect(alive(pid)).toBe(false);
    if (process.platform === 'win32') expect(took).toBeLessThan(5000);
    else expect(took).toBeGreaterThanOrEqual(5000);
  }, 20_000);

  it('M1.6-E36 kvman\'s stop ends running processes without kernel.process.exited', async () => {
    const kernel = await harness.start([processOwner]);
    const { pid } = infoSchema.parse(await kernel.exec('p.start', { name: 'server', args: ['-e', scripts.forever] }));
    await kernel.restart();
    expect(alive(pid)).toBe(false);
    expect(await kernel.exec('p.list', {})).toEqual([]);
    await kernel.clock.advance(0);
    expect(await kernel.exec('p.exited-get', {})).toEqual([]);
  });
});
