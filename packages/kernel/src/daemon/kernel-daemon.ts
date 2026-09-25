import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kernelPorts, type KernelStarted } from '@kvman/protocol';
import { EventHub } from '../adapters/events/event-hub.ts';
import { HttpAdapter } from '../adapters/http/http-adapter.ts';
import type { FaultPoints } from '../faults/fault-points.ts';
import type { ExtensionModules } from '../hosts/host-manager.ts';
import type { StartHostThread } from '../hosts/host-thread.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import { kernelProblem, ProblemError } from '../problems.ts';
import type { RegistryInput } from '../registry/kernel-registry.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { KernelIdentity } from '../runtime/health.ts';
import { KernelRuntime } from '../runtime/kernel-runtime.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import { betterSqlite3Driver } from '../storage/better-sqlite3-driver.ts';
import { openKernelDatabase } from '../storage/database.ts';
import type { Connection } from '../storage/driver.ts';
import type { UlidGenerator } from '../ulid.ts';
import { acquireDaemonLock, releaseDaemonLock } from './daemon-lock.ts';
import { prepareHomeFolder } from './home-folder.ts';
import { processStartOf } from './process-identity.ts';

export type DaemonLogger = KernelLogger & { close(): void };

// Until M2.2 installs extensions, their manifests, grants, and entry modules are given as data (ADR 0089).
export type BootOptions = {
  home: string;
  port?: number;
  extensions: RegistryInput;
  grants: GrantsSource;
  modules: ExtensionModules;
  poolSize: number;
  ids: UlidGenerator;
  now: () => number;
  timers: SchedulerTimers;
  openLogger: (home: string) => DaemonLogger;
  defaultLocale: () => string;
  startThread?: StartHostThread;
  faults?: FaultPoints;
};

// The kvman version is the kernel package's version (ADR 0089).
export function kernelVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  if (typeof manifest === 'object' && manifest !== null && 'version' in manifest && typeof manifest.version === 'string') return manifest.version;
  throw new Error('the kernel package.json has no version');
}

type Resources = { options: BootOptions; logger: DaemonLogger; adapter: HttpAdapter; identity: KernelIdentity; connection: Connection };

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
      databaseFile: join(options.home, 'kvman.db'), connection, extensions: options.extensions, grants: options.grants, modules: options.modules,
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
    let kernel: Kernel | undefined;
    try {
      const port = await adapter.bind(options.port === undefined ? kernelPorts : { port: options.port }, correlationId);
      const processStart = processStartOf(process.pid);
      if (processStart === undefined) throw new ProblemError(kernelProblem('INTERNAL', { correlationId, detail: 'ps does not list the kernel process' }));
      const identity: KernelIdentity = { version: kernelVersion(), instanceId: randomUUID(), processStart, port, home, startedAt: options.now() };
      acquireDaemonLock(home, { pid: process.pid, processStart, nonce: identity.instanceId, port, startedAt: identity.startedAt }, correlationId);
      nonce = identity.instanceId;
      connection = openKernelDatabase(join(home, 'kvman.db'), betterSqlite3Driver, correlationId);
      kernel = new Kernel({ options, logger, adapter, identity, connection });
      await kernel.#start();
      return kernel;
    } catch (error) {
      logger.write({ level: 'error', message: 'the kernel did not start', fields: { error: error instanceof Error ? error.message : 'unknown' }, attributes: { correlationId } });
      await kernel?.runtime.stop();
      connection?.close();
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
    const { adapter, identity, logger, options } = this.#resources;
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
