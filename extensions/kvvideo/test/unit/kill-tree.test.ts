import { describe, expect, it } from 'vitest';
import { startsOwnGroup, treeKillOf } from '../../src/programs/kill-tree.ts';

describe('killing a program tree per OS (16 §16.3)', () => {
  it('M5.1-E7 Linux and macOS kill the group; Windows runs taskkill /T /F', () => {
    expect(treeKillOf('linux', 42)).toEqual({ kind: 'group', pid: -42, signal: 'SIGKILL' });
    expect(treeKillOf('darwin', 42)).toEqual({ kind: 'group', pid: -42, signal: 'SIGKILL' });
    expect(treeKillOf('win32', 42)).toEqual({ kind: 'taskkill', command: 'taskkill', args: ['/PID', '42', '/T', '/F'] });
    expect([startsOwnGroup('linux'), startsOwnGroup('darwin'), startsOwnGroup('win32')]).toEqual([true, true, false]);
  });
});
