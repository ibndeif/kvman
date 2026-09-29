import { join } from 'node:path';
import {
  betterSqlite3Driver, createUlidGenerator, KernelRuntime, kernelReadRoots, openKernelDatabase, sandboxProcessStarter, SecretStore, systemTimers,
  verifyEnabledSnapshots, workerThreadStarter, type Connection, type LogRecord,
} from '@kvman/kernel';
import type { CrashPoints } from './crash-points.ts';
import { fakeCommands, type FakeProcess } from './fake-processes.ts';

export type RuntimeSettings = { home: string; crashes: CrashPoints; processes: Readonly<Record<string, FakeProcess>>; logged: LogRecord[] };

export type OpenRuntime = { runtime: KernelRuntime; connection: Connection };

export const kvmanVersion = '0.0.0';

// A registry nothing listens on: a test kernel never reaches the network.
const closedRegistry = 'http://127.0.0.1:9/';

// ADR 0165: the real runtime on the test's home, with the real clock, no builtin tarballs, and its log records kept
// for the checks. Both host starters pass through the crash points.
export async function openRuntime(settings: RuntimeSettings): Promise<OpenRuntime> {
  const { home, crashes } = settings;
  const ids = createUlidGenerator(Date.now);
  const databaseFile = join(home, 'kvman.db');
  const connection = openKernelDatabase(databaseFile, betterSqlite3Driver, ids.next());
  const startSandbox = sandboxProcessStarter(kernelReadRoots());
  const runtime = new KernelRuntime({
    databaseFile, connection, secrets: SecretStore.load(home, ids.next()),
    install: { home, builtin: join(home, 'builtin'), registry: closedRegistry, environment: process.env },
    ids, now: Date.now, timers: systemTimers, poolSize: 2, logger: { write: (record) => settings.logged.push(record) },
    identity: { version: kvmanVersion, instanceId: crypto.randomUUID(), processStart: new Date().toISOString(), port: 0, home, startedAt: Date.now() },
    requestShutdown: () => undefined,
    startThread: crashes.wrap(workerThreadStarter(databaseFile)),
    startSandbox: (snapshotFolder) => crashes.wrap(startSandbox(snapshotFolder)),
    commands: fakeCommands(settings.processes),
  });
  await runtime.install.clearStaging();
  await verifyEnabledSnapshots(runtime);
  await runtime.start();
  return { runtime, connection };
}

// Without drain() first, stopping leaves the rows a crash leaves; the test kernel uses it both to crash and to close.
export async function stopRuntime(open: OpenRuntime): Promise<void> {
  await open.runtime.stop();
  open.connection.close();
}
