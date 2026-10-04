import { describe, expect, it } from 'vitest';
import { programCommand } from '../../src/bin/program-command.ts';

describe('running npm per OS (plan 02 §2.16, CLAUDE.md §3)', () => {
  it('QA17-E31 Linux and macOS run npm directly, in the bin\'s own process group', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      expect(programCommand(platform, 'npm', ['install'])).toEqual({ command: 'npm', args: ['install'] });
    }
  });

  it('QA17-E31 Windows runs cmd.exe /d /s /c npm …', () => {
    expect(programCommand('win32', 'npm', ['install'])).toEqual({ command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm', 'install'] });
  });
});
