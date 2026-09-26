import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kernelPorts, type KernelStarted } from '@kvman/protocol';
import { EventHub } from '../adapters/events/event-hub.ts';
import { HttpAdapter } from '../adapters/http/http-adapter.ts';
import type { FaultPoints } from '../faults/fault-points.ts';
import type { StartHostThread } from '../hosts/host-thread.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import { kernelProblem, ProblemError } from '../problems.ts';
import type { EnabledExtensions } from '../registry/registry-state.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { KernelIdentity } from '../runtime/health.ts';
import { KernelRuntime } from '../runtime/kernel-runtime.ts';
import { installBuiltins, verifyEnabledSnapshots } from '../runtime/snapshot-boot.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import { betterSqlite3Driver } from '../storage/better-sqlite3-driver.ts';
import { openKernelDatabase } from '../storage/database.ts';
import type { Connection } from '../storage/driver.ts';
import type { UlidGenerator } from '../ulid.ts';
import { acquireDaemonLock, releaseDaemonLock } from './daemon-lock.ts';
import { prepareHomeFolder } from './home-folder.ts';
import { processStartOf } from './process-identity.ts';

export type DaemonLogger = KernelLogger & { close(): void };

// Installed extensions come from the database (ADR 0114); the workspaces that enable them and their grants are data
// until M2.3 and M2.4. `builtin` is the folder of the builtin tarballs (the kernel package's by default, ADR 0115),
// `npmRegistry` the value of KVMAN_NPM_REGISTRY, and `environment` the variables pnpm and git inherit (path, proxies).
export type BootOptions = {
  home: string;
  port?: number;
  enabled: EnabledExtensions;
  grants: GrantsSource;
  builtin?: string;
  npmRegistry: string;
  environment: NodeJS.ProcessEnv;
  poolSize: number;
  ids: UlidGenerator;
  now: () => number;
  timers: SchedulerTimers;
  openLogger: (home: string) => DaemonLogger;
  defaultLocale: () => string;
  startThread?: StartHostThread;
  faults?: FaultPoints;
};

// ADR 0115: the builtin tarballs and digests.json that `pnpm build` puts in the kernel package.
export function kernelBuiltinFolder(): string {
  return fileURLToPath(new URL('../../builtin', import.meta.url));
}

// A first run that failed leaves no database, so the next start is a first run again (ADR 0115).
function removeDatabase(home: string): void {
  for (const suffix of ['', '-wal', '-shm']) rmSync(join(home, `kvman.db${suffix}`), { force: true });
}

// The kvman version is the kernel package's version (ADR 0089).
export function kernelVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  if (typeof manifest === 'object' && manifest !== null && 'version' in manifest && typeof manifest.version === 'string') return manifest.version;
  throw new Error('the kernel package.json has no version');
}

type Resources = { options: BootOptions; logger: DaemonLogger; adapter: HttpAdapter; identity: KernelIdentity; connection: Connection; firstRun: boolean };

// The daemon's kernel (03 §3.9–§3.10): booted in the order of 03 §3.9 and shut down once, however often it is asked.
export class Kernel {
  readonly identity: KernelIdentity;
  readonly connection: Connection;
  readonly runtime: KernelRuntime;
  readonly #resources: Resources;
  readonly #hub: EventHub;
  #shutdown: Promise<void> | undefined;

  private constructor(resources: Resources) {
    const { options, identity, connection } = resources;
    this.#resources = resources;
    this.identity = identity;
    this.connection = connection;
    this.runtime = new KernelRuntime({
      databaseFile: join(options.home, 'kvman.db'), connection, enabled: options.enabled, grants: options.grants,
      install: { home: options.home, builtin: options.builtin ?? kernelBuiltinFolder(), registry: options.npmRegistry, environment: options.environment },
      logger: resources.logger, ids: options.ids, now: options.now, timers: options.timers, poolSize: options.poolSize,
      defaultLocale: options.defaultLocale, identity, requestShutdown: () => void this.shutdown(),
      ...(options.startThread === undefined ? {} : { startThread: options.startThread }),
      ...(options.faults === undefined ? {} : { faults: options.faults }),
    });
    this.#hub = new EventHub({ connection, pipeline: this.runtime.pipeline, live: this.runtime.live, timers: options.timers, version: identity.version });
  }

  static async boot(options: BootOptions): Promise<Kernel> {
    const { home, ids } = options;
    const correlationId = ids.next();
    prepareHomeFolder(home, correlationId);
    const logger = options.openLogger(home);
    const adapter = new HttpAdapter({ ids, timers: options.timers, logger });
    let nonce: string | undefined;
    let connection: Connection | undefined;
    const firstRun = !existsSync(join(home, 'kvman.db'));
    let kernel: Kernel | undefined;
    try {
      const port = await adapter.bind(options.port === undefined ? kernelPorts : { port: options.port }, correlationId);
      const processStart = processStartOf(process.pid);
      if (processStart === undefined) throw new ProblemError(kernelProblem('INTERNAL', { correlationId, detail: 'ps does not list the kernel process' }));
      const identity: KernelIdentity = { version: kernelVersion(), instanceId: randomUUID(), processStart, port, home, startedAt: options.now() };
      acquireDaemonLock(home, { pid: process.pid, processStart, nonce: identity.instanceId, port, startedAt: identity.startedAt }, correlationId);
      nonce = identity.instanceId;
      connection = openKernelDatabase(join(home, 'kvman.db'), betterSqlite3Driver, correlationId);
      kernel = new Kernel({ options, logger, adapter, identity, connection, firstRun });
      await kernel.#start();
      return kernel;
    } catch (error) {
      logger.write({ level: 'error', message: 'the kernel did not start', fields: { error: error instanceof Error ? error.message : 'unknown' }, attributes: { correlationId } });
      await kernel?.runtime.stop();
      connection?.close();
      if (firstRun && connection !== undefined) removeDatabase(home);
      if (nonce !== undefined) releaseDaemonLock(home, nonce);
      await adapter.close();
      logger.close();
      throw error;
    }
  }

  // 03 §3.9 and ADRs 0090, 0091: stop admitting, let running handlers finish for 10 s, set the rest back to pending,
  // answer waiting requests and streams, stop the hosts, flush the commit pipeline, close SQLite, release the lock.
  shutdown(): Promise<void> {
    this.#shutdown ??= this.#stop();
    return this.#shutdown;
  }

  async #start(): Promise<void> {
    const { adapter, identity, logger, options, firstRun } = this.#resources;
    await this.runtime.install.clearStaging();
    await verifyEnabledSnapshots(this.runtime);
    if (firstRun) await installBuiltins(this.runtime, options.ids.next());
    await this.runtime.start();
    adapter.open({ runtime: this.runtime, hub: this.#hub });
    const started: KernelStarted = { version: identity.version, instanceId: identity.instanceId };
    const correlationId = options.ids.next();
    const result = await this.runtime.pipeline.enqueue({
      origin: { kind: 'announce', correlationId }, writes: [], sends: [], replies: [], publishes: [{ type: 'kernel.started', payload: started }],
    });
    if (!result.committed) throw new ProblemError(result.problem);
    this.connection
      .prepare(`INSERT INTO kernel_settings (key, value, revision, updated_at) VALUES ('kvman.version', ?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, revision = revision + 1, updated_at = excluded.updated_at`)
      .run(JSON.stringify(identity.version), options.now());
    logger.write({ level: 'info', message: 'kernel started', fields: { port: identity.port, version: identity.version }, attributes: { correlationId } });
  }

  async #stop(): Promise<void> {
    const { adapter, identity, logger, options } = this.#resources;
    adapter.stopAdmitting();
    await this.runtime.drain();
    adapter.releaseWaiting();
    this.#hub.close();
    await this.runtime.stop();
    this.runtime.pipeline.flush();
    await adapter.close();
    this.connection.close();
    releaseDaemonLock(identity.home, identity.instanceId);
    logger.write({ level: 'info', message: 'kernel stopped', fields: {}, attributes: { correlationId: options.ids.next() } });
    logger.close();
  }
}
