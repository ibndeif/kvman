import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startKernel } from '../../src/kernel.ts';
import { isAlive } from '../../src/processes/process-kill.ts';
import { insertProcess, listProcesses } from '../../src/processes/process-rows.ts';
import { openDatabase } from '../../src/storage/database.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('processes a crash left behind (02 §2.16)', () => {
  it('M1.6-E37 a recorded process still alive at start is killed, and its row cleared', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'kvman-leftovers-'));
    folders.push(root);
    const home = path.join(root, 'home');
    const homeFolder = path.join(root, 'home-folder');
    mkdirSync(homeFolder);
    mkdirSync(home);
    const leftover = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1 << 30);'], { detached: process.platform !== 'win32', stdio: 'ignore' });
    const pid = leftover.pid;
    if (pid === undefined) throw new Error('the leftover process did not start');
    const database = openDatabase(path.join(home, 'kvman.db'));
    insertProcess(database, { extension: '@test/p', workspaceId: 'home', name: 'server', pid, startedAt: new Date().toISOString() });
    database.close();
    const kernel = await startKernel({
      home,
      homeFolder,
      preset: { name: 'test', extensions: {}, settings: { 'kernel.workers': 1 } },
      presetFolder: root,
      bundled: new Map(),
      mode: 'web',
      logLevel: 'error',
      terminalLog: false,
      startFolder: homeFolder,
      trust: () => Promise.resolve(true),
    });
    await vi.waitFor(() => expect(isAlive(pid)).toBe(false), { timeout: 10_000, interval: 25 });
    await kernel.close();
    const reopened = openDatabase(path.join(home, 'kvman.db'));
    expect(listProcesses(reopened)).toEqual([]);
    reopened.close();
  });
});
