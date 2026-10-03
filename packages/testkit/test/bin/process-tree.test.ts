import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { spawnCommand, stopPreviewChild, trackChild, treeKill, type TrackedChild } from '../../src/preview/process-tree.ts';

// How the preview bin starts and stops its children, per OS (CLAUDE.md §3): directly in their own process group on
// Linux and macOS, through `cmd.exe /d /s /c` with `taskkill /T /F` on Windows. The platform is swapped per test and
// restored after each one, so no other test sees it.
const realPlatform = process.platform;

const children: ChildProcess[] = [];

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});

function usePlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform });
}

function startIdler(onSigint: string): { child: ChildProcess; ready: Promise<void> } {
  // The child prints `ready` once its SIGINT handler is installed, so the test never signals too early.
  const child = spawn(process.execPath, ['-e', `${onSigint} process.stdout.write('ready\\n'); setInterval(() => {}, 1000);`], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  children.push(child);
  const ready = new Promise<void>((resolve, reject) => {
    let seen = '';
    child.stdout?.setEncoding('utf8').on('data', (text: string) => {
      seen += text;
      if (seen.includes('ready')) resolve();
    });
    child.once('error', reject);
  });
  return { child, ready };
}

describe('the preview processes per OS (CLAUDE.md §3)', () => {
  it('QA17-E37 Linux and macOS start commands directly in their own process group', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      expect(spawnCommand(platform, 'kvman', ['--home', 'x'])).toEqual({ command: 'kvman', args: ['--home', 'x'], detached: true });
    }
  });

  it('QA17-E37 Windows starts commands through cmd.exe /d /s /c', () => {
    expect(spawnCommand('win32', 'kvman', ['--home', 'x'])).toEqual({ command: 'cmd.exe', args: ['/d', '/s', '/c', 'kvman', '--home', 'x'], detached: false });
  });

  it('QA17-E37 Linux and macOS kill a tree by its group, Windows with taskkill /T /F', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      expect(treeKill(platform, 123)).toEqual({ kind: 'group', pid: 123 });
    }
    expect(treeKill('win32', 123)).toEqual({ kind: 'taskkill', command: 'taskkill', args: ['/PID', '123', '/T', '/F'] });
  });

  it('QA17-E37 Linux and macOS stop the preview with SIGINT first', async () => {
    for (const platform of ['linux', 'darwin'] as const) {
      usePlatform(platform);
      const started = startIdler("process.on('SIGINT', () => process.exit(0));");
      await started.ready;
      const tracked = trackChild(started.child);
      await stopPreviewChild(tracked, 5_000);
      expect(tracked.child.exitCode).toBe(0);
      expect(tracked.child.signalCode).toBeNull();
    }
  });

  it('QA17-E37 Linux and macOS fall back to killing the group when SIGINT is ignored', async () => {
    for (const platform of ['linux', 'darwin'] as const) {
      usePlatform(platform);
      const started = startIdler("process.on('SIGINT', () => {});");
      await started.ready;
      const tracked = trackChild(started.child);
      await stopPreviewChild(tracked, 50);
      expect(tracked.child.signalCode).toBe('SIGKILL');
    }
  });

  it('QA17-E37 Windows kills the tree and sends no signal', async () => {
    usePlatform('win32');
    const sent: (string | undefined)[] = [];
    const tracked: TrackedChild = {
      child: {
        pid: 424242,
        kill: (signal?: string) => {
          sent.push(signal);
          return true;
        },
        exitCode: null,
        signalCode: null,
      } as unknown as ChildProcess,
      exited: Promise.resolve(),
      spawnError: undefined,
    };
    await stopPreviewChild(tracked, 50);
    expect(sent).toEqual([]);
  });
});
