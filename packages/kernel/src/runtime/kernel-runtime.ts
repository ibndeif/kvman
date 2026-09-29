import { realpathSync } from 'node:fs';
import type { HealthResult, MessageStatus, QuarantineReason, ReplyPayload } from '@kvman/protocol';
import { SocketRequests } from '../adapters/socket/socket-requests.ts';
import { inertFaults } from '../faults/fault-points.ts';
import { CallDepths } from '../hosts/call-depths.ts';
import { HostFailures } from '../hosts/host-failures.ts';
import { HostManager } from '../hosts/host-manager.ts';
import { workerThreadStarter } from '../hosts/host-thread.ts';
import { LlmCalls } from '../hosts/llm-calls.ts';
import { defaultReadPoolSize, ReadPool, readThreadStarter } from '../hosts/read-pool/read-pool.ts';
import { sandboxProcessStarter } from '../hosts/sandbox/sandbox-process.ts';
import { ExtensionVersions, reloadGraceMs } from '../hosts/extension-versions.ts';
import { KernelCommits } from '../hosts/kernel-commits.ts';
import type { KernelHost } from '../hosts/kernel-host.ts';
import { ProcessCalls } from '../hosts/process-calls.ts';
import { kernelReadRoots } from '../install/kernel-packages.ts';
import { SnapshotStore } from '../install/snapshot-store.ts';
import type { InstallService } from '../install/install-service.ts';
import { DataMigrations } from '../migrations/data-migrations.ts';
import { kernelProblem, ProblemError } from '../problems.ts';
import { LiveBus } from '../hosts/live-bus.ts';
import { Quarantines } from '../hosts/quarantines.ts';
import { QueryPath, type QueryAnswer } from '../hosts/query-path.ts';
import { RecordedValueStore } from '../hosts/recorded-value-store.ts';
import { ReplyWaiters, type ReplyListener } from '../hosts/reply-waiters.ts';
import { RpcService } from '../hosts/rpc-service.ts';
import { Settlement } from '../hosts/settlement.ts';
import { UnregisteredCodes } from '../hosts/unregistered-codes.ts';
import { SavedPreferences } from '../preferences/user-preferences.ts';
import { RegistryState } from '../registry/registry-state.ts';
import { WorkspaceDirectory } from '../registry/workspace-directory.ts';
import { AdapterPath, type AdapterCommand, type Submission } from '../router/adapter-path.ts';
import { PayloadValidators } from '../router/payload-validators.ts';
import type { QueryRequest } from '../router/query-admission.ts';
import { Router } from '../router/router.ts';
import { PendingIndex } from '../scheduler/pending-index.ts';
import { Scheduler } from '../scheduler/scheduler.ts';
import { writeCommittedSecrets } from '../secrets/secret-writes.ts';
import { CommitPipeline } from '../storage/commit-pipeline.ts';
import { readMessageStatus } from '../storage/message-status.ts';
import { StepJournal } from '../store/step-journal.ts';
import { JobTokens } from '../processes/job-tokens.ts';
import { reconcileProcesses } from '../processes/process-reconciliation.ts';
import { ProcessSupervisor } from '../processes/process-supervisor.ts';
import { ScheduleService } from '../schedules/schedule-service.ts';
import { recoverInterrupted } from './crash-recovery.ts';
import { FileServices } from './file-services.ts';
import { healthOf } from './health.ts';
import { wireKernelHost } from './kernel-host-wiring.ts';
import { installService, type KernelRuntimeOptions } from './runtime-options.ts';
import { PresetImportTokens } from '../presets/import-tokens.ts';

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
  // The saved language every message without an inherited locale gets (02 §2.10, ADR 0161).
  readonly preferences: SavedPreferences;
  readonly workspaces: WorkspaceDirectory;
  readonly install: InstallService;
  readonly snapshots: SnapshotStore;
  readonly live = new LiveBus();
  readonly files: FileServices;
  readonly processes: ProcessSupervisor;
  // kernel.sock's requests (12 §12.4); the daemon serves them on the socket.
  readonly socket: SocketRequests;
  readonly migrations: DataMigrations;
  readonly versions: ExtensionVersions;
  readonly schedules: ScheduleService;
  readonly #commits: KernelCommits;
  readonly #tokens = new JobTokens();
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
    this.files = new FileServices({ home: options.install.home, connection, now, timers, ids, logger: options.logger, faults });
    const { files: blobFiles } = this.files;
    this.registry = new RegistryState(connection);
    this.preferences = new SavedPreferences(connection);
    this.workspaces = new WorkspaceDirectory(connection);
    const registry = () => this.registry.current();
    this.install = installService(options);
    this.snapshots = new SnapshotStore(this.install.paths, (extension) => this.registry.digestOf(extension));
    this.index = PendingIndex.rebuild(connection, now);
    this.router = new Router({
      registry, grants: this.registry, workspaces: this.workspaces, validators: new PayloadValidators(), ids, now, defaultLocale: () => this.preferences.locale(),
      blobs: this.files.rights, files: blobFiles,
    });
    this.pipeline = new CommitPipeline({ connection, files: blobFiles, admission: this.router, now, faults });
    this.processes = new ProcessSupervisor({
      home: options.install.home, connection, pipeline: this.pipeline, store: this.files.store, live: this.live, tokens: this.#tokens,
      environment: options.install.environment, timers, now, logger: options.logger, faults, commands: options.commands,
    });
    writeCommittedSecrets(this.pipeline, options.secrets, options.logger, faults);
    this.#waiters = new ReplyWaiters({ connection, files: blobFiles });
    const values = new RecordedValueStore(connection);
    this.#reads = new ReadPool(options.readPoolSize ?? defaultReadPoolSize, readThreadStarter(options.databaseFile));
    const starters = {
      startThread: options.startThread ?? workerThreadStarter(options.databaseFile), startSandbox: options.startSandbox ?? sandboxProcessStarter(kernelReadRoots()),
    };
    this.hosts = new HostManager({
      connection, registry, grants: this.registry, snapshots: this.snapshots, values, logger: options.logger, ids, poolSize: options.poolSize, timers, now,
      ...starters, reads: this.#reads, failures: new HostFailures(), faults, secrets: options.secrets,
    });
    this.scheduler = new Scheduler({
      connection, files: blobFiles, pipeline: this.pipeline, index: this.index, registry, dispatcher: this.hosts, now, timers, faults,
      onCommitted: (result) => {
        if (result.committed) this.#waiters.resolve(result.replies);
      },
    });
    this.#adapter = new AdapterPath(this.pipeline, ids);
    this.#quarantines = new Quarantines(this.pipeline, this.registry, ids, (extension) => this.processes.killExtension(extension));
    this.#commits = new KernelCommits(this.pipeline, this.scheduler, this.#waiters);
    const quarantine = (extension: string, reason: QuarantineReason): Promise<void> => this.#quarantines.quarantine(extension, reason);
    this.migrations = new DataMigrations({ connection, pipeline: this.pipeline, hosts: { connection, ...starters, timers, now, ids, logger: options.logger }, faults, quarantine });
    this.versions = new ExtensionVersions({
      connection, pipeline: this.pipeline, commits: this.#commits, registry: this.registry, snapshots: this.snapshots, migrations: this.migrations, hosts: this.hosts,
      scheduler: this.scheduler, faults, quarantine,
    });
    this.schedules = new ScheduleService({ connection, pipeline: this.pipeline, registry: this.registry, workspaces: this.workspaces, ids, logger: options.logger });
    this.#queries = new QueryPath(this.router, this.scheduler);
    this.socket = new SocketRequests({
      tokens: this.#tokens, registry, grants: this.registry, pipeline: this.pipeline, queries: this.#queries, waiters: this.#waiters,
      status: (messageId) => this.messageStatus(messageId), timers, ids,
    });
    this.#connectHosts(options, values);
  }

  // 03 §3.9 step 6, ADR 0091: rows a crash left running are recovered before the scheduler claims anything.
  // Boot step 6 also reconciles processes (ADR 0139), clears `once` trust (07 §7.2) and the temporary files of puts a
  // crash interrupted; GC runs at boot and every 10 minutes (ADR 0134).
  async start(): Promise<void> {
    const { connection, now, ids, logger, timers } = this.#options;
    this.files.files.clearTemporary();
    const recovered = await recoverInterrupted({ connection, files: this.files.files, pipeline: this.pipeline, registry: () => this.registry.current(), now });
    await reconcileProcesses({ connection, store: this.files.store, pipeline: this.pipeline, logger, timers, now });
    const cleared = await this.pipeline.enqueue({ origin: { kind: 'change', change: { kind: 'trust.clear-once' }, correlationId: ids.next() }, writes: [], sends: [], publishes: [], replies: [] });
    if (!cleared.committed) throw new ProblemError(cleared.problem);
    this.index.placeStored(connection, recovered);
    await this.schedules.start();
    await this.files.collector.start();
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
    return readMessageStatus({ connection: this.#options.connection, files: this.files.files }, messageId);
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
    this.migrations.stop();
    const stopped = Promise.all([this.hosts.stop().then(() => this.#reads.close()), this.files.collector.stop(), this.processes.stop(), this.schedules.stop()]).then(() => undefined);
    this.#waiters.close();
    this.#queries.close();
    return stopped;
  }

  #connectHosts(options: KernelRuntimeOptions, values: RecordedValueStore): void {
    const { connection, ids } = options;
    const registry = () => this.registry.current();
    const commits = this.#commits;
    this.files.link({ pipeline: this.pipeline, commits, grants: this.registry });
    const rpc = new RpcService({
      connection, router: this.router, pipeline: this.pipeline, scheduler: this.scheduler, waiters: this.#waiters, values, ids, registry,
      queries: this.#queries, live: this.live, journal: new StepJournal(connection, options.now), logger: options.logger, depths: new CallDepths(),
      faults: options.faults ?? inertFaults, secrets: options.secrets, blobs: this.files.blobCalls, files: this.files.workspaceCalls,
      processes: new ProcessCalls({
        connection, registry, grants: this.registry, supervisor: this.processes, tokens: this.#tokens, ids, home: realpathSync.native(options.install.home),
      }),
    });
    const quarantines = this.#quarantines;
    const settlement = new Settlement({
      pipeline: this.pipeline, scheduler: this.scheduler, waiters: this.#waiters, queries: this.#queries, live: this.live, values, quarantines,
      results: this.router, blobs: this.files, processes: this.processes,
      codes: new UnregisteredCodes({ logger: options.logger, manifestOf: (extension) => registry().manifestOf(extension) }),
    });
    const llm = new LlmCalls({ connection, commits, registry: this.registry, live: this.live, provide: (call) => this.hosts.provide(call) });
    const abortMessages = (messageIds: ReadonlySet<string>): void => {
      this.hosts.abortMessages(messageIds);
      llm.abortMessages(messageIds);
      this.processes.killSpawnedBy(messageIds);
    };
    const presetTokens = new PresetImportTokens(options.now);
    const kernel = wireKernelHost({
      connection, commits, pipeline: this.pipeline, scheduler: this.scheduler, registry: this.registry, directory: this.workspaces, install: this.install,
      snapshots: this.snapshots, trust: this.files.trust, queries: this.#queries, secrets: options.secrets, versions: this.versions, migrations: this.migrations,
      timers: options.timers, faults: options.faults ?? inertFaults, home: options.install.home, logger: options.logger, version: options.identity.version, now: options.now, presetTokens, preferences: this.preferences, llm, provide: (call) => this.hosts.provide(call), ids, health: () => this.health(),
      abortMessages, retireHosts: (extension) => this.hosts.replaceHosts(extension, reloadGraceMs), killProcesses: (workspaceId) => this.processes.killWorkspace(workspaceId), quarantine: (extension, reason) => quarantines.quarantine(extension, reason),
      requestShutdown: options.requestShutdown, index: this.index,
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
