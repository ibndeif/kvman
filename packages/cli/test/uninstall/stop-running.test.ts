import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kvmanPid, npmCalls, useWorlds } from './support.ts';

const world = useWorlds();

describe('kvman uninstall stops the kvman that runs on the home (ADR 0031, 3 and 7)', () => {
  it('QA43-H6 a running kvman is stopped first, and npm runs once it is gone', async () => {
    const one = world({ answers: ['y', 'n'], running: 1000 });
    expect(await one.run()).toBe(0);
    expect(one.shown().startsWith('This removes kvman from this computer.\nkvman is running and will be stopped.\nRemove kvman? [y/N] ')).toBe(true);
    expect(one.signals).toEqual([kvmanPid]);
    expect(one.programs.map((call) => [call.args.join(' '), call.kvmanAlive])).toEqual([
      ['root -g', true],
      ['uninstall -g kvman', false],
    ]);
  });

  it("QA43-H7 the stop is the platform's", async () => {
    for (const platform of ['linux', 'darwin'] as const) {
      const signalled = world({ answers: ['y', 'n'], running: 500, platform });
      expect(await signalled.run(), platform).toBe(0);
      expect(signalled.signals).toEqual([kvmanPid]);
      expect(signalled.programs.map((call) => call.program)).toEqual(['npm', 'npm']);
    }
    const windows = world({ answers: ['y', 'n'], running: 500, platform: 'win32' });
    expect(await windows.run()).toBe(0);
    expect(windows.signals).toEqual([]);
    expect(windows.programs.map((call) => [call.program, call.args.join(' ')])).toEqual([
      ['npm', 'root -g'],
      ['taskkill', `/PID ${String(kvmanPid)} /T /F`],
      ['npm', 'uninstall -g kvman'],
    ]);
  });

  it("QA43-E9 a kvman that doesn't stop fails the command", async () => {
    for (const running of ['never', 15_001] as const) {
      const one = world({ answers: ['y', 'y'], running });
      expect(await one.run(), String(running)).toBe(1);
      expect(one.errors()).toBe("kvman didn't stop within 15 seconds.\nNothing was removed.\n");
      expect(npmCalls(one)).toEqual(['root -g']);
      expect(existsSync(path.join(one.home, 'kvman.db'))).toBe(true);
    }
    const justInTime = world({ answers: ['y', 'n'], running: 15_000 });
    expect(await justInTime.run()).toBe(0);
  });

  it('QA43-E10 a lock whose process is gone stops nothing', async () => {
    const one = world({ answers: ['y', 'n'], running: 'gone' });
    expect(await one.run()).toBe(0);
    expect(one.shown()).not.toContain('kvman is running');
    expect(one.signals).toEqual([]);
    expect(one.programs.map((call) => call.program)).toEqual(['npm', 'npm']);
  });
});
