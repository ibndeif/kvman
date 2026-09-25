import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlidGenerator, Kernel, type DaemonLogger, type LogRecord } from '@kvman/kernel';
import type { Capabilities } from '@kvman/protocol';
import { defaultGrants, entryOf, ManualTimers, registryInput, workspaceA } from '../hosts/harness.ts';

// A booted kernel in its own home folder (03 §3.9): the fixture extensions on real worker threads, the manual kernel
// clock for every kernel timer (waits, pings, the shutdown grace), and a real HTTP listener.
export type DaemonFixture = {
  kernel: Kernel;
  home: string;
  port: number;
  timers: ManualTimers;
  logged: LogRecord[];
  grants: Record<string, Capabilities>;
  // Shuts down, first passing the 10 s grace on the kernel clock so a handler still running cannot hold it.
  close(): Promise<void>;
};

export type BootFixtureOptions = { home?: string; port?: number; timers?: ManualTimers; logged?: LogRecord[]; openLogger?: (home: string) => DaemonLogger };

export function temporaryHome(): string {
  return join(mkdtempSync(join(tmpdir(), 'kvman-daemon-')), 'home');
}

export async function bootFixture(options: BootFixtureOptions = {}): Promise<DaemonFixture> {
  const home = options.home ?? temporaryHome();
  const timers = options.timers ?? new ManualTimers();
  const logged = options.logged ?? [];
  const grants = { ...defaultGrants };
  const kernel = await Kernel.boot({
    home, ...(options.port === undefined ? {} : { port: options.port }), extensions: registryInput(), grants: { capabilities: (extension) => grants[extension] }, modules: { entry: entryOf }, poolSize: 1,
    ids: createUlidGenerator(Date.now), now: () => timers.time.value, timers,
    openLogger: options.openLogger ?? (() => ({ write: (record) => logged.push(record), close: () => undefined })), defaultLocale: () => 'en',
  });
  kernel.connection.prepare('INSERT OR IGNORE INTO workspaces (id, path, name, created_at) VALUES (?, ?, ?, ?)').run(workspaceA, '/w/a', 'A', 1);
  return {
    kernel, home, port: kernel.identity.port, timers, logged, grants,
    close: async () => {
      const stopped = kernel.shutdown();
      timers.advance(10_000);
      await stopped;
    },
  };
}
