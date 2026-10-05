import { describe, expect, it } from 'vitest';
import { callTimeout, treeKill } from '../../src/calls/shell-command.ts';
import { commandSpawn } from '../../src/mcp/command-transport.ts';

const start = { command: 'npx', args: ['-y', 'server'], cwd: '/work/app', env: { TOKEN: 'secret' } };

describe('how an MCP command is started and killed on each OS (08 §8.5, ADR 0020, 4 and 17)', () => {
  it('QA29-E15 Linux and macOS start it in its own group, Windows does not, and each kills the tree its own way', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      expect(commandSpawn(platform, start, { PATH: '/usr/bin' })).toEqual({ cwd: '/work/app', env: { PATH: '/usr/bin', TOKEN: 'secret' }, stdio: ['pipe', 'pipe', 'pipe'], detached: true, windowsHide: true });
      expect(treeKill(platform, 42)).toEqual({ kind: 'group', pid: 42 });
    }
    expect(commandSpawn('win32', start, { Path: 'C:\\Windows' })).toEqual({ cwd: '/work/app', env: { Path: 'C:\\Windows', TOKEN: 'secret' }, stdio: ['pipe', 'pipe', 'pipe'], detached: false, windowsHide: true });
    expect(treeKill('win32', 42)).toEqual({ kind: 'taskkill', program: 'taskkill', args: ['/PID', '42', '/T', '/F'] });
  });

  it('QA29-E13 a call waits 120 s by default, and a longer wait than 600 s is cut to 600 s', () => {
    expect([callTimeout(undefined), callTimeout(300), callTimeout(700_000)]).toEqual([120_000, 300, 600_000]);
  });

  it("QA29-E15 a server's variable wins over kvman's own of the same name", () => {
    expect(commandSpawn('linux', start, { TOKEN: 'from kvman', HOME: '/home/me' }).env).toEqual({ TOKEN: 'secret', HOME: '/home/me' });
  });
});
