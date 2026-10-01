import { describe, expect, it } from 'vitest';
import { callTimeout, shellCommand, treeKill } from '../../src/calls/shell-command.ts';

describe('the shell per OS (08 §8.3, ADR 0008, 6 and 7)', () => {
  it('M2.4-E29 bash on Linux and macOS, pwsh or powershell.exe on Windows, kvcoder.shell.path over both, and the tree kill per OS', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      const bash = shellCommand(platform, null, () => true);
      expect(bash).toMatchObject({ program: 'bash', toolName: 'bash' });
      expect(bash.args('ls')).toEqual(['-lc', 'ls']);
      expect(treeKill(platform, 42)).toEqual({ kind: 'group', pid: 42 });
    }
    const pwsh = shellCommand('win32', null, () => true);
    expect(pwsh).toMatchObject({ program: 'pwsh', toolName: 'powershell' });
    expect(pwsh.args('dir')).toEqual(['-NoProfile', '-Command', 'dir']);
    expect(shellCommand('win32', null, () => false)).toMatchObject({ program: 'powershell.exe', toolName: 'powershell' });
    expect(treeKill('win32', 42)).toEqual({ kind: 'taskkill', program: 'taskkill', args: ['/PID', '42', '/T', '/F'] });
    const configured = shellCommand('linux', '/opt/bin/zsh', () => false);
    expect(configured.program).toBe('/opt/bin/zsh');
    expect(configured.args('ls')).toEqual(['-lc', 'ls']);
    expect(shellCommand('linux', '/usr/bin/pwsh', () => false).args('ls')).toEqual(['-NoProfile', '-Command', 'ls']);
    expect(shellCommand('win32', 'C:\\Git\\bin\\bash.exe', () => true)).toMatchObject({ program: 'C:\\Git\\bin\\bash.exe', toolName: 'powershell' });
  });

  it('M2.4-E26 the timeout is 120 s by default, the model may ask for up to 600 s, and more is cut to 600 s', () => {
    expect(callTimeout(undefined)).toBe(120_000);
    expect(callTimeout(300_000)).toBe(300_000);
    expect(callTimeout(900_000)).toBe(600_000);
  });
});
