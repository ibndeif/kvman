import type { ReplyPayload } from '@kvman/protocol';
import { HostManager, type ExtensionModules } from '../hosts/host-manager.ts';
import { workerThreadStarter, type StartHostThread } from '../hosts/host-thread.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import { LiveBus } from '../hosts/live-bus.ts';
import { QueryPath, type QueryAnswer } from '../hosts/query-path.ts';
import { RecordedValueStore } from '../hosts/recorded-value-store.ts';
import { ReplyWaiters } from '../hosts/reply-waiters.ts';
import { RpcService } from '../hosts/rpc-service.ts';
import { Settlement } from '../hosts/settlement.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
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
  registry: () => KernelRegistry;
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
// pool, and the live bus, wired so every kind is delivered the same way (02 §2.3).
export class KernelRuntime {
  readonly router: Router;
  readonly pipeline: CommitPipeline;
  readonly index: PendingIndex;
  readonly scheduler: Scheduler;
  readonly hosts: HostManager;
  readonly live = new LiveBus();
  readonly #adapter: AdapterPath;
  readonly #waiters: ReplyWaiters;
  readonly #queries: QueryPath;

  constructor(options: KernelRuntimeOptions) {
    const { connection, registry, ids, now } = options;
    this.index = PendingIndex.rebuild(connection, now);
    this.router = new Router({ registry, grants: options.grants, validators: new PayloadValidators(), ids, now, defaultLocale: options.defaultLocale });
    this.pipeline = new CommitPipeline({ connection, admission: this.router, now, pending: this.index });
    const values = new RecordedValueStore(connection);
    this.hosts = new HostManager({
      connection, registry, modules: options.modules, values, logger: options.logger, ids, poolSize: options.poolSize,
      startThread: options.startThread ?? workerThreadStarter(options.databaseFile),
    });
    this.scheduler = new Scheduler({ connection, pipeline: this.pipeline, index: this.index, registry, dispatcher: this.hosts, now, timers: options.timers });
    this.#adapter = new AdapterPath(this.pipeline, ids);
    this.#waiters = new ReplyWaiters(connection);
    this.#queries = new QueryPath(this.router, this.scheduler);
    const rpc = new RpcService({
      connection, router: this.router, pipeline: this.pipeline, scheduler: this.scheduler, waiters: this.#waiters, values, ids, registry,
      queries: this.#queries, live: this.live, journal: new StepJournal(connection, now), logger: options.logger,
    });
    const settlement = new Settlement({ pipeline: this.pipeline, scheduler: this.scheduler, waiters: this.#waiters, queries: this.#queries, live: this.live, values });
    this.hosts.connect({
      called: (invocation, call) => rpc.handle(invocation, call),
      completed: (invocation, frame) => settlement.completed(invocation, frame),
      lost: (invocation) => settlement.lost(invocation),
      refused: (claim, problem) => settlement.refused(claim, problem),
    });
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
}
