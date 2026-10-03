import { describe, expect, it } from 'vitest';
import { programCommand, treeKill } from '../../src/program-command.ts';

describe('running npm per OS (02 §2.16, CLAUDE.md §3)', () => {
  it('M2.5-E15 Linux and macOS run npm directly in its own group, and a cancel kills the group', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      expect(programCommand(platform, 'npm', ['run', 'check', '--', '--json'])).toEqual({ command: 'npm', args: ['run', 'check', '--', '--json'], detached: true });
      expect(treeKill(platform, 42)).toEqual({ kind: 'group', pid: 42 });
    }
  });

  it('M2.5-E15 Windows runs cmd.exe /d /s /c npm, and a cancel runs taskkill /T /F', () => {
    expect(programCommand('win32', 'npx', ['tsc', '--noEmit'])).toEqual({ command: 'cmd.exe', args: ['/d', '/s', '/c', 'npx', 'tsc', '--noEmit'], detached: false });
    expect(treeKill('win32', 42)).toEqual({ kind: 'taskkill', command: 'taskkill', args: ['/PID', '42', '/T', '/F'] });
  });
});
