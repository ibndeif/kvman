import type { HealthResult, MessageStatus, QuarantineReason, ReplyPayload } from '@kvman/protocol';
import { inertFaults, type FaultPoints } from '../faults/fault-points.ts';
import { CallDepths } from '../hosts/call-depths.ts';
import { HostFailures } from '../hosts/host-failures.ts';
import { HostManager } from '../hosts/host-manager.ts';
import { workerThreadStarter, type StartHostThread } from '../hosts/host-thread.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import { ExtensionCommands } from '../hosts/extension-commands.ts';
import { ExtensionQueries } from '../hosts/extension-queries.ts';
import { KernelCommits } from '../hosts/kernel-commits.ts';
import { KernelHost } from '../hosts/kernel-host.ts';
import { hostPlatform, pnpmExecutable } from '../install/bundled-tools.ts';
import { InstallService } from '../install/install-service.ts';
import { installPaths } from '../install/install-paths.ts';
import { kernelSdkVersion } from '../install/kernel-packages.ts';
import { ForkedLoader } from '../install/loader-process.ts';
import { SnapshotStore } from '../install/snapshot-store.ts';
import { kernelProblem } from '../problems.ts';
import { kernelEventPayloads } from '../registry/kernel-types.ts';
import { KernelQueries } from '../hosts/kernel-queries.ts';
import { LiveBus } from '../hosts/live-bus.ts';
import { Quarantines } from '../hosts/quarantines.ts';
import { QueryPath, type QueryAnswer } from '../hosts/query-path.ts';
import { RecordedValueStore } from '../hosts/recorded-value-store.ts';
import { ReplyWaiters, type ReplyListener } from '../hosts/reply-waiters.ts';
import { RpcService } from '../hosts/rpc-service.ts';
import { Settlement } from '../hosts/settlement.ts';
import { RegistryState, type EnabledExtensions } from '../registry/registry-state.ts';
import { AdapterPath, type AdapterCommand, type Submission } from '../router/adapter-path.ts';
import type { GrantsSource } from '../router/grants.ts';
import { PayloadValidators } from '../router/payload-validators.ts';
import type { QueryRequest } from '../router/query-admission.ts';
import { Router } from '../router/router.ts';
import { PendingIndex } from '../scheduler/pending-index.ts';
import { Scheduler } from '../scheduler/scheduler.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import { CommitPipeline } from '../storage/commit-pipeline.ts';
import { readMessageStatus } from '../storage/message-status.ts';
import type { Connection } from '../storage/driver.ts';
import { StepJournal } from '../store/step-journal.ts';
import type { UlidGenerator } from '../ulid.ts';
import { recoverInterrupted } from './crash-recovery.ts';
import { healthOf, type KernelIdentity } from './health.ts';

export type KernelRuntimeOptions = {
  databaseFile: string;
  connection: Connection;
  // ADR 0114: the workspaces that enable each extension, and their grants, as data until M2.3 and M2.4.
  enabled: EnabledExtensions;
  grants: GrantsSource;
  install: InstallSettings;
  logger: KernelLogger;
  ids: UlidGenerator;
  now: () => number;
  timers: SchedulerTimers;
  poolSize: number;
  defaultLocale: () => string;
  identity: KernelIdentity;
  // kernel.shutdown committed (ADR 0090): the daemon runs its shutdown.
  requestShutdown: () => void;
  startThread?: StartHostThread;
  // ADR 0100: the fault points of a test run; inert unless given.
  faults?: FaultPoints;
};

// Where extensions are installed from and to (06 §6.2, §6.9): the home folder, the builtin tarballs, the npm
// registry of KVMAN_NPM_REGISTRY, and the environment whose path and proxies pnpm and git use.
export type InstallSettings = { home: string; builtin: string; registry: string; environment: NodeJS.ProcessEnv };

function installService(options: KernelRuntimeOptions): InstallService {
  const { install, timers, now, identity } = options;
  return new InstallService({
    paths: installPaths(install.home, install.builtin), pnpm: () => pnpmExecutable(hostPlatform()), registry: install.registry, kvmanVersion: identity.version,
    environment: install.environment, timers, loader: new ForkedLoader(timers), sdkVersion: kernelSdkVersion(), kernelEvents: kernelEventPayloads(), now,
  });
}

// 03 §3.9: in-flight invocations get this long to finish at shutdown.
export const shutdownGraceMs = 10_000;

// The kernel's message path in one process (03 §3.2): router, commit pipeline, pending index, scheduler, the shared
// pool with its supervision, the kernel host, and the live bus, wired so every kind is delivered the same way.
// Nothing is claimed until start() has recovered what a crash interrupted.
export class KernelRuntime {
  readonly router: Router;
  readonly pipeline: CommitPipeline;
  readonly index: PendingIndex;
  readonly scheduler: Scheduler;
  readonly hosts: HostManager;
  readonly registry: RegistryState;
  readonly install: InstallService;
  readonly snapshots: SnapshotStore;
  readonly live = new LiveBus();
  readonly #adapter: AdapterPath;
  readonly #waiters: ReplyWaiters;
  readonly #queries: QueryPath;
  readonly #options: KernelRuntimeOptions;
  readonly #quarantines: Quarantines;
  #kernelHost: KernelHost | undefined;

  constructor(options: KernelRuntimeOptions) {
    const { connection, ids, now, timers } = options;
    const faults = options.faults ?? inertFaults;
    this.#options = options;
    this.registry = new RegistryState(options.enabled, connection);
    const registry = () => this.registry.current();
    this.install = installService(options);
    this.snapshots = new SnapshotStore(this.install.paths, (extension) => this.registry.digestOf(extension));
    this.index = PendingIndex.rebuild(connection, now);
    this.router = new Router({ registry, grants: options.grants, validators: new PayloadValidators(), ids, now, defaultLocale: options.defaultLocale });
    this.pipeline = new CommitPipeline({ connection, admission: this.router, now, faults });
    this.#waiters = new ReplyWaiters(connection);
    const values = new RecordedValueStore(connection);
    this.hosts = new HostManager({
      connection, registry, snapshots: this.snapshots, values, logger: options.logger, ids, poolSize: options.poolSize, timers, now,
      startThread: options.startThread ?? workerThreadStarter(options.databaseFile), failures: new HostFailures(), faults,
    });
    this.scheduler = new Scheduler({
      connection, pipeline: this.pipeline, index: this.index, registry, dispatcher: this.hosts, now, timers, faults,
      onCommitted: (result) => {
        if (result.committed) this.#waiters.resolve(result.replies);
      },
    });
    this.#adapter = new AdapterPath(this.pipeline, ids);
    this.#quarantines = new Quarantines(this.pipeline, this.registry, ids);
    this.#queries = new QueryPath(this.router, this.scheduler);
    this.#connectHosts(options, values);
  }

  // 03 §3.9 step 6, ADR 0091: rows a crash left running are recovered before the scheduler claims anything.
  async start(): Promise<void> {
    const { connection, now } = this.#options;
    const recovered = await recoverInterrupted({ connection, pipeline: this.pipeline, registry: () => this.registry.current(), now });
    this.index.placeStored(connection, recovered);
    this.scheduler.start();
  }

  // 03 §3.6: stored and announced in one kernel unit; boot uses it for snapshots that fail their rehash (step 4).
  quarantine(extension: string, reason: QuarantineReason): Promise<void> {
    return this.#quarantines.quarantine(extension, reason);
  }

  submitCommand(command: AdapterCommand): Promise<Submission> {
    return this.#adapter.submitCommand(command);
  }

  awaitReply(messageId: string): Promise<ReplyPayload> {
    return this.#waiters.wait(messageId);
  }

  listenForReply(messageId: string, listener: ReplyListener): () => void {
    return this.#waiters.listen(messageId, listener);
  }

  messageStatus(messageId: string): MessageStatus | undefined {
    return readMessageStatus(this.#options.connection, messageId);
  }

  health(): HealthResult {
    return healthOf(this.#options.connection, this.#options.identity, this.#options.now());
  }

  query(request: QueryRequest): Promise<QueryAnswer> {
    return this.#queries.ask(request);
  }

  // Shutdown (03 §3.9, ADR 0091): nothing new is claimed, and running invocations get the grace to finish; the rest
  // return to pending without an attempt.
  async drain(graceMs = shutdownGraceMs): Promise<void> {
    this.scheduler.stop();
    this.#kernelHost?.interrupt();
    await this.hosts.drain(graceMs);
  }

  // Nothing new is claimed or dispatched, workers end, and every caller still waiting is answered, so the work
  // already started can finish before the database closes. Without drain() first, this is how a crash leaves rows.
  stop(): Promise<void> {
    this.scheduler.stop();
    const stopped = this.hosts.stop();
    this.#waiters.close();
    this.#queries.close();
    return stopped;
  }

  #connectHosts(options: KernelRuntimeOptions, values: RecordedValueStore): void {
    const { connection, ids } = options;
    const registry = () => this.registry.current();
    const rpc = new RpcService({
      connection, router: this.router, pipeline: this.pipeline, scheduler: this.scheduler, waiters: this.#waiters, values, ids, registry,
      queries: this.#queries, live: this.live, journal: new StepJournal(connection, options.now), logger: options.logger, depths: new CallDepths(),
      faults: options.faults ?? inertFaults,
    });
    const quarantines = this.#quarantines;
    const settlement = new Settlement({
      pipeline: this.pipeline, scheduler: this.scheduler, waiters: this.#waiters, queries: this.#queries, live: this.live, values, quarantines,
    });
    const commits = new KernelCommits(this.pipeline, this.scheduler, this.#waiters);
    const abortMessages = (messageIds: ReadonlySet<string>): void => this.hosts.abortMessages(messageIds);
    const extensions = new ExtensionCommands({ connection, commits, scheduler: this.scheduler, grants: options.grants, registry: this.registry, install: this.install, abortMessages });
    const kernel = new KernelHost({
      connection, commits, scheduler: this.scheduler, grants: options.grants, queries: this.#queries, abortMessages, extensions,
      requestShutdown: options.requestShutdown,
      kernelQueries: new KernelQueries({
        connection, registry, health: () => this.health(), version: options.identity.version,
        extensions: new ExtensionQueries(connection, this.registry, options.grants),
      }),
    });
    this.#kernelHost = kernel;
    this.hosts.connect({
      called: (invocation, call) => rpc.handle(invocation, call),
      completed: (invocation, frame) => settlement.completed(invocation, frame),
      loadFailed: (invocation, problem) => settlement.loadFailed(invocation, problem),
      lost: (invocation) => settlement.lost(invocation),
      refused: (claim, problem) => settlement.refused(claim, problem),
      timedOut: (invocation, reason) => settlement.timedOut(invocation, reason),
      aborted: (invocation) => settlement.aborted(invocation),
      collateral: (invocation) => settlement.collateral(invocation),
      interrupted: (invocation) => settlement.interrupted(invocation),
      quarantine: (extension, reason) => quarantines.quarantine(extension, reason),
      kernelCommand: (claim) => kernel.run(claim),
      integrityFailed: async (claim) => {
        const problem = kernelProblem('EXT_INTEGRITY', { correlationId: claim.message.correlationId, messageId: claim.message.id, detail: `the snapshot of ${claim.extension} does not match its digest` });
        await settlement.refused(claim, problem);
        await quarantines.quarantine(claim.extension, 'EXT_INTEGRITY');
      },
    });
  }
}
