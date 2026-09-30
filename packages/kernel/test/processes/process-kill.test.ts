import { describe, expect, it } from 'vitest';
import { killPlan, spawnOptionsFor } from '../../src/processes/process-kill.ts';

describe('ending a process tree on each OS (02 §2.16)', () => {
  it('M1.6-E35 Linux and macOS signal the process group; Windows runs taskkill /T /F', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      expect(killPlan(platform, 42, 'SIGTERM')).toEqual({ kind: 'group', pid: 42, signal: 'SIGTERM' });
      expect(killPlan(platform, 42, 'SIGKILL')).toEqual({ kind: 'group', pid: 42, signal: 'SIGKILL' });
      expect(spawnOptionsFor(platform)).toEqual({ detached: true, windowsHide: true });
    }
    expect(killPlan('win32', 42, 'SIGTERM')).toEqual({ kind: 'command', command: 'taskkill', args: ['/PID', '42', '/T', '/F'] });
    expect(spawnOptionsFor('win32')).toEqual({ detached: false, windowsHide: true });
  });
});
