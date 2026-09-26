import type { HealthResult, MessageStatus, QuarantineReason, ReplyPayload } from '@kvman/protocol';
import { inertFaults, type FaultPoints } from '../faults/fault-points.ts';
import { CallDepths } from '../hosts/call-depths.ts';
import { HostFailures } from '../hosts/host-failures.ts';
import { HostManager } from '../hosts/host-manager.ts';
import { InspectionQueries } from '../hosts/inspection-queries.ts';
import { workerThreadStarter, type StartHostThread } from '../hosts/host-thread.ts';
import { defaultReadPoolSize, ReadPool, readThreadStarter } from '../hosts/read-pool/read-pool.ts';
import { sandboxProcessStarter } from '../hosts/sandbox/sandbox-process.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import { EnableCommands } from '../hosts/enable-commands.ts';
import { ExtensionCommands } from '../hosts/extension-commands.ts';
import { ExtensionQueries } from '../hosts/extension-queries.ts';
import { KernelCommits } from '../hosts/kernel-commits.ts';
import { KernelHost, type KernelCommand } from '../hosts/kernel-host.ts';
import { SerialChanges } from '../hosts/serial-changes.ts';
import { SettingCommands } from '../hosts/setting-commands.ts';
import { WorkspaceCommands } from '../hosts/workspace-commands.ts';
import { WorkspaceForgetting } from '../hosts/workspace-forgetting.ts';
import { WorkspaceQueries } from '../hosts/workspace-queries.ts';
import { hostPlatform, pnpmExecutable } from '../install/bundled-tools.ts';
import { InstallService } from '../install/install-service.ts';
import { installPaths } from '../install/install-paths.ts';
import { kernelReadRoots, kernelSdkVersion } from '../install/kernel-packages.ts';
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
import { ConfigChecker } from '../config/config-values.ts';
import { RegistryState } from '../registry/registry-state.ts';
import { WorkspaceDirectory } from '../registry/workspace-directory.ts';
import { AdapterPath, type AdapterCommand, type Submission } from '../router/adapter-path.ts';
import { PayloadValidators } from '../router/payload-validators.ts';
import type { QueryRequest } from '../router/query-admission.ts';
import { Router } from '../router/router.ts';
import { PendingIndex } from '../scheduler/pending-index.ts';
import { Scheduler } from '../scheduler/scheduler.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import { writeCommittedSecrets } from '../secrets/secret-writes.ts';
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
  install: InstallSettings;
  // secrets.json, loaded at boot step 3 (ADR 0126).
  secrets: SecretStore;
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
  // ADR 0131: the read pool's threads, 2 unless given.
  readPoolSize?: number;
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
  readonly workspaces: WorkspaceDirectory;
  readonly install: InstallService;
  readonly snapshots: SnapshotStore;
  readonly live = new LiveBus();
  readonly #adapter: AdapterPath;
  readonly #waiters: ReplyWaiters;
  readonly #queries: QueryPath;
  readonly #options: KernelRuntimeOptions;
  readonly #quarantines: Quarantines;
  readonly #reads: ReadPool;
  #kernelHost: KernelHost | undefined;

  constructor(options: KernelRuntimeOptions) {
    const { connection, ids, now, timers } = options;
    const faults = options.faults ?? inertFaults;
    this.#options = options;
    this.registry = new RegistryState(connection);
    this.workspaces = new WorkspaceDirectory(connection);
    const registry = () => this.registry.current();
    this.install = installService(options);
    this.snapshots = new SnapshotStore(this.install.paths, (extension) => this.registry.digestOf(extension));
    this.index = PendingIndex.rebuild(connection, now);
    this.router = new Router({ registry, grants: this.registry, workspaces: this.workspaces, validators: new PayloadValidators(), ids, now, defaultLocale: options.defaultLocale });
    this.pipeline = new CommitPipeline({ connection, admission: this.router, now, faults });
    writeCommittedSecrets(this.pipeline, options.secrets, options.logger, faults);
    this.#waiters = new ReplyWaiters(connection);
    const values = new RecordedValueStore(connection);
    this.#reads = new ReadPool(options.readPoolSize ?? defaultReadPoolSize, readThreadStarter(options.databaseFile));
    this.hosts = new HostManager({
      connection, registry, grants: this.registry, snapshots: this.snapshots, values, logger: options.logger, ids, poolSize: options.poolSize, timers, now,
      startThread: options.startThread ?? workerThreadStarter(options.databaseFile), startSandbox: sandboxProcessStarter(kernelReadRoots()),
      reads: this.#reads, failures: new HostFailures(), faults,
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
    const stopped = this.hosts.stop().then(() => this.#reads.close());
    this.#waiters.close();
    this.#queries.close();
    return stopped;
  }

  // The kernel commands that change extensions, workspaces, presets, config, and secrets (03 §3.8).
  #kernelCommands(commits: KernelCommits, abortMessages: (messageIds: ReadonlySet<string>) => void): Map<string, KernelCommand> {
    const { connection, timers } = this.#options;
    const serial = new SerialChanges();
    const { scheduler, registry } = this;
    const extensions = new ExtensionCommands({ connection, commits, scheduler, grants: registry, registry, install: this.install, serial, abortMessages });
    const enabling = new EnableCommands({
      connection, commits, scheduler, registry, snapshots: this.snapshots, config: new ConfigChecker(new PayloadValidators()), serial,
      quarantine: (extension, reason) => this.#quarantines.quarantine(extension, reason),
    });
    const workspaces = new WorkspaceCommands({ connection, commits, registry, home: this.#options.install.home });
    const forgetting = new WorkspaceForgetting({
      connection, pipeline: this.pipeline, commits, scheduler, registry, directory: this.workspaces, serial, timers, faults: this.#options.faults ?? inertFaults, abortMessages,
    });
    const settings = new SettingCommands({ connection, commits, registry });
    return new Map<string, KernelCommand>([
      ['kernel.extension.stage', (claim, signal) => extensions.stage(claim, signal)],
      ['kernel.extension.install', (claim) => extensions.install(claim)],
      ['kernel.extension.uninstall', (claim) => extensions.uninstall(claim)],
      ['kernel.extension.enable', (claim) => enabling.enable(claim)],
      ['kernel.extension.disable', (claim) => enabling.disable(claim)],
      ['kernel.workspace.open', (claim) => workspaces.open(claim)],
      ['kernel.workspace.rename', (claim) => workspaces.rename(claim)],
      ['kernel.workspace.forget', (claim, signal) => forgetting.forget(claim, signal)],
      ['kernel.config.set', (claim) => settings.setConfig(claim)],
      ['kernel.secret.set', (claim) => settings.setSecret(claim)],
      ['kernel.secret.clear', (claim) => settings.clearSecret(claim)],
    ]);
  }

  #connectHosts(options: KernelRuntimeOptions, values: RecordedValueStore): void {
    const { connection, ids } = options;
    const registry = () => this.registry.current();
    const rpc = new RpcService({
      connection, router: this.router, pipeline: this.pipeline, scheduler: this.scheduler, waiters: this.#waiters, values, ids, registry,
      queries: this.#queries, live: this.live, journal: new StepJournal(connection, options.now), logger: options.logger, depths: new CallDepths(),
      faults: options.faults ?? inertFaults, secrets: options.secrets,
    });
    const quarantines = this.#quarantines;
    const settlement = new Settlement({
      pipeline: this.pipeline, scheduler: this.scheduler, waiters: this.#waiters, queries: this.#queries, live: this.live, values, quarantines,
    });
    const commits = new KernelCommits(this.pipeline, this.scheduler, this.#waiters);
    const abortMessages = (messageIds: ReadonlySet<string>): void => this.hosts.abortMessages(messageIds);
    const kernel = new KernelHost({
      connection, commits, scheduler: this.scheduler, grants: this.registry, queries: this.#queries, abortMessages, commands: this.#kernelCommands(commits, abortMessages),
      requestShutdown: options.requestShutdown,
      kernelQueries: new KernelQueries({
        connection, registry, health: () => this.health(), version: options.identity.version,
        extensions: new ExtensionQueries(connection, this.registry, this.registry), workspaces: new WorkspaceQueries(connection, this.registry, options.secrets),
        inspection: new InspectionQueries({ connection, registry, grants: this.registry }), grants: this.registry,
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
