import type { ReplyPayload } from '@kvman/protocol';
import { CallDepths } from '../hosts/call-depths.ts';
import { HostFailures } from '../hosts/host-failures.ts';
import { HostManager, type ExtensionModules } from '../hosts/host-manager.ts';
import { workerThreadStarter, type StartHostThread } from '../hosts/host-thread.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import { KernelHost } from '../hosts/kernel-host.ts';
import { LiveBus } from '../hosts/live-bus.ts';
import { Quarantines } from '../hosts/quarantines.ts';
import { QueryPath, type QueryAnswer } from '../hosts/query-path.ts';
import { RecordedValueStore } from '../hosts/recorded-value-store.ts';
import { ReplyWaiters } from '../hosts/reply-waiters.ts';
import { RpcService } from '../hosts/rpc-service.ts';
import { Settlement } from '../hosts/settlement.ts';
import type { RegistryInput } from '../registry/kernel-registry.ts';
import { RegistryState } from '../registry/registry-state.ts';
import { AdapterPath, type AdapterCommand, type Submission } from '../router/adapter-path.ts';
import type { GrantsSource } from '../router/grants.ts';
import { PayloadValidators } from '../router/payload-validators.ts';
import type { QueryRequest } from '../router/query-admission.ts';
import { Router } from '../router/router.ts';
import { PendingIndex } from '../scheduler/pending-index.ts';
import { Scheduler } from '../scheduler/scheduler.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { Connection } from '../storage/driver.ts';
import { StepJournal } from '../store/step-journal.ts';
import type { UlidGenerator } from '../ulid.ts';

export type KernelRuntimeOptions = {
  databaseFile: string;
  connection: Connection;
  extensions: RegistryInput;
  grants: GrantsSource;
  modules: ExtensionModules;
  logger: KernelLogger;
  ids: UlidGenerator;
  now: () => number;
  timers: SchedulerTimers;
  poolSize: number;
  defaultLocale: () => string;
  startThread?: StartHostThread;
};

// The kernel's message path in one process (03 §3.2): router, commit pipeline, pending index, scheduler, the shared
// pool with its supervision, the kernel host, and the live bus, wired so every kind is delivered the same way.
export class KernelRuntime {
  readonly router: Router;
  readonly pipeline: CommitPipeline;
  readonly index: PendingIndex;
  readonly scheduler: Scheduler;
  readonly hosts: HostManager;
  readonly registry: RegistryState;
  readonly live = new LiveBus();
  readonly #adapter: AdapterPath;
  readonly #waiters: ReplyWaiters;
  readonly #queries: QueryPath;

  constructor(options: KernelRuntimeOptions) {
    const { connection, ids, now, timers } = options;
    this.registry = new RegistryState(options.extensions, connection);
    const registry = () => this.registry.current();
    this.index = PendingIndex.rebuild(connection, now);
    this.router = new Router({ registry, grants: options.grants, validators: new PayloadValidators(), ids, now, defaultLocale: options.defaultLocale });
    this.pipeline = new CommitPipeline({ connection, admission: this.router, now, pending: this.index });
    this.#waiters = new ReplyWaiters(connection);
    const values = new RecordedValueStore(connection);
    this.hosts = new HostManager({
      connection, registry, modules: options.modules, values, logger: options.logger, ids, poolSize: options.poolSize, timers, now,
      startThread: options.startThread ?? workerThreadStarter(options.databaseFile), failures: new HostFailures(),
    });
    this.scheduler = new Scheduler({
      connection, pipeline: this.pipeline, index: this.index, registry, dispatcher: this.hosts, now, timers,
      onCommitted: (result) => {
        if (result.committed) this.#waiters.resolve(result.replies);
      },
    });
    this.#adapter = new AdapterPath(this.pipeline, ids);
    this.#queries = new QueryPath(this.router, this.scheduler);
    this.#connectHosts(options, values);
    this.scheduler.start();
  }

  submitCommand(command: AdapterCommand): Promise<Submission> {
    return this.#adapter.submitCommand(command);
  }

  awaitReply(messageId: string): Promise<ReplyPayload> {
    return this.#waiters.wait(messageId);
  }

  query(request: QueryRequest): Promise<QueryAnswer> {
    return this.#queries.ask(request);
  }

  // Nothing new is claimed or dispatched, workers end, and every caller still waiting is answered, so the work
  // already started can finish before the database closes.
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
    });
    const quarantines = new Quarantines(this.pipeline, this.registry, ids);
    const settlement = new Settlement({
      pipeline: this.pipeline, scheduler: this.scheduler, waiters: this.#waiters, queries: this.#queries, live: this.live, values, quarantines,
    });
    const kernel = new KernelHost({
      connection, pipeline: this.pipeline, scheduler: this.scheduler, waiters: this.#waiters, grants: options.grants,
      abortMessages: (messageIds) => this.hosts.abortMessages(messageIds),
    });
    this.hosts.connect({
      called: (invocation, call) => rpc.handle(invocation, call),
      completed: (invocation, frame) => settlement.completed(invocation, frame),
      loadFailed: (invocation, problem) => settlement.loadFailed(invocation, problem),
      lost: (invocation) => settlement.lost(invocation),
      refused: (claim, problem) => settlement.refused(claim, problem),
      timedOut: (invocation, reason) => settlement.timedOut(invocation, reason),
      aborted: (invocation) => settlement.aborted(invocation),
      collateral: (invocation) => settlement.collateral(invocation),
      quarantine: (extension, reason) => quarantines.quarantine(extension, reason),
      kernelCommand: (claim) => kernel.run(claim),
    });
  }
}
