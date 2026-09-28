import { dirname } from 'node:path';
import type { CompleteFrame, HostOutcome, HostUnitOfWork, Json } from '@kvman/protocol';
import {
  AdapterPath, betterSqlite3Driver, CommitPipeline, FileServices, inertFaults, ExtensionQueries, insertVersionRows, insertWorkspace, KernelCommits, KernelHost, kernelOwner, InspectionQueries, KernelQueries, LlmQueries, ProcessQueries,
  KernelRegistry, LiveBus, openKernelDatabase, PayloadValidators, PendingIndex, PresetImportTokens, PresetQueries, Quarantines, QueryPath, recoverInterrupted, RecordedValueStore, RegistryState,
  ReplyWaiters, Router, Scheduler, SecretStore, Settlement, WorkspaceDirectory, WorkspaceQueries, writeAppliedPreset, type Claim, type Connection, type Dispatcher,
  type HostLoad,
} from '../../src/index.ts';
import { manifest, workspaceA } from '../registry/manifests.ts';
import { appliedPreset } from '../registry/presets.ts';
import { MapGrants } from '../router/harness.ts';
import { ulids } from '../storage/harness.ts';
import { ManualTimers, startTime, type TestTime } from '../scheduler/doubles.ts';
import { NotificationQueries } from '../../src/hosts/notification-queries.ts';
import { UiQueries } from '../../src/hosts/ui-queries.ts';
import { SavedPreferences } from '../../src/preferences/user-preferences.ts';

// The kernel's scheduling core for the model test (ADR 0102): router, commit pipeline, pending index, scheduler,
// settlement, and the kernel host on a real SQLite file. A dispatcher double stands in for the hosts: it records
// each claim, and the test ends invocations through the real settlement. A crash drops every object and reopens the file.

export const modelExtension = '@acme/model';
export const laneType = 'model.work';
export const freeType = 'model.free';
export const continuationType = 'model.reply.record';

const anyObject = { type: 'object' };

const model = manifest(modelExtension, 'model', {
  types: [
    { type: laneType, kind: 'command', description: 'Work in a lane.', input: anyObject, access: 'all', handler: `command:${laneType}`, lane: 'key:{{ $payload.lane }}' },
    { type: freeType, kind: 'command', description: 'Work without a lane.', input: anyObject, access: 'all', handler: `command:${freeType}` },
    { type: continuationType, kind: 'command', description: 'Records a reply.', input: anyObject, access: 'internal', handler: `command:${continuationType}` },
  ],
});

// Records claims in order; kernel types go to the real kernel host. A cancel aborts running invocations.
class ModelDispatcher implements Dispatcher {
  readonly claims: Claim[] = [];
  readonly running = new Map<string, Claim>();
  kernel: KernelHost | undefined;

  load(): HostLoad {
    return { host: modelExtension, inFlight: this.running.size, cap: 1000 };
  }

  dispatch(claim: Claim): void {
    if (claim.extension === kernelOwner) {
      void this.kernel?.run(claim);
      return;
    }
    this.claims.push(claim);
    this.running.set(claim.message.id, claim);
  }

  abort(messageIds: ReadonlySet<string>): void {
    for (const id of messageIds) this.running.delete(id);
  }
}

export type ModelKernel = {
  file: string;
  connection: Connection;
  time: TestTime;
  timers: ManualTimers;
  pipeline: CommitPipeline;
  scheduler: Scheduler;
  dispatcher: ModelDispatcher;
  settlement: Settlement;
  adapter: AdapterPath;
};

// ADRs 0114, 0124: the model extension is installed and enabled in workspace A as rows; the dispatcher double never
// loads its code.
function installModel(connection: Connection): void {
  const digest = 'a'.repeat(64);
  insertVersionRows(connection, { name: modelExtension, digest, source: `local:${digest}`, manifest: model, installedAt: startTime });
  insertWorkspace(connection, { workspaceId: workspaceA, path: '/w/a', name: 'A' }, startTime);
  writeAppliedPreset(connection, workspaceA, appliedPreset({ [modelExtension]: { digest } }), startTime);
}

// Every commit is applied as it is enqueued (one unit per batch), so nothing waits on a real timer.
export async function bootModelKernel(file: string, time: TestTime = { value: startTime }): Promise<ModelKernel> {
  const connection = openKernelDatabase(file, betterSqlite3Driver, ulids.next());
  const now = (): number => time.value;
  installModel(connection);
  const registry = new RegistryState(connection);
  const current = (): KernelRegistry => registry.current();
  const grants = new MapGrants();
  grants.grant(modelExtension, workspaceA, {});
  const timers = new ManualTimers(time);
  const services = new FileServices({ home: dirname(file), connection, now, timers, ids: ulids, logger: { write: () => undefined }, faults: inertFaults });
  const { files } = services;
  const router = new Router({
    registry: current, grants, workspaces: new WorkspaceDirectory(connection), validators: new PayloadValidators(), ids: ulids, now, defaultLocale: () => 'en', blobs: services.rights, files,
  });
  const index = PendingIndex.rebuild(connection, now);
  const pipeline = new CommitPipeline({ connection, files, admission: router, now, maxBatchUnits: 1 });
  const waiters = new ReplyWaiters({ connection, files });
  const dispatcher = new ModelDispatcher();
  const scheduler = new Scheduler({
    connection, files, pipeline, index, registry: current, dispatcher, now, timers,
    onCommitted: (result) => {
      if (result.committed) waiters.resolve(result.replies);
    },
  });
  const queries = new QueryPath(router, scheduler);
  const settlement = new Settlement({
    pipeline, scheduler, waiters, queries, live: new LiveBus(), values: new RecordedValueStore(connection), quarantines: new Quarantines(pipeline, registry, ulids, () => undefined),
    results: router, blobs: services, processes: { invocationEnded: () => undefined },
  });
  const commits = new KernelCommits(pipeline, scheduler, waiters);
  const preferences = new SavedPreferences(connection);
  services.link({ pipeline, commits, grants });
  dispatcher.kernel = new KernelHost({
    connection, commits, scheduler, grants, queries, abortMessages: (ids) => dispatcher.abort(ids), commands: new Map(),
    requestShutdown: () => undefined,
    kernelQueries: new KernelQueries({
      connection, registry: current, version: '0.0.0', extensions: new ExtensionQueries(connection, registry, grants),
      workspaces: new WorkspaceQueries(connection, registry, SecretStore.load(dirname(file), ulids.next())),
      inspection: new InspectionQueries({ connection, registry: current, grants }), processes: new ProcessQueries(connection, grants), grants, trust: services.trust,
      presets: new PresetQueries({ connection, registry: current, tokens: new PresetImportTokens(now) }),
      llm: new LlmQueries({ connection, registry, provide: () => { throw new Error('the model kernel runs no providers'); }, now }),
      preferences, ui: new UiQueries({ connection, registry, preferences }), notifications: new NotificationQueries(connection, now),
      health: () => ({ status: 'ok', version: '0.0.0', instanceId: '0b5c7f2e-4a1d-4c3b-9e8f-1a2b3c4d5e6f', processStart: 'x', uptimeMs: 0, port: 4173, home: '/h' }),
    }),
  });
  const recovered = await recoverInterrupted({ connection, files, pipeline, registry: current, now });
  index.placeStored(connection, recovered);
  scheduler.start();
  return { file, connection, time, timers, pipeline, scheduler, dispatcher, settlement, adapter: new AdapterPath(pipeline, ulids) };
}

// Commits apply as they are enqueued, so what follows them (settlement, scheduler passes, the kernel host) is
// microtasks only; a macrotask runs once all of them have.
export async function quiesce(): Promise<void> {
  await new Promise<void>((resolve) => { setImmediate(resolve); });
}

// A crash: nothing in memory survives; the next kernel recovers from the file (03 §3.9, ADR 0091).
export async function crash(kernel: ModelKernel): Promise<ModelKernel> {
  kernel.scheduler.stop();
  kernel.connection.close();
  return bootModelKernel(kernel.file, kernel.time);
}

const emptyUnit: HostUnitOfWork = { writes: [], sends: [], publishes: [], replies: [], config: [], secrets: [], blobRefs: [] };

// Ends a running invocation as its host would report it.
export async function end(kernel: ModelKernel, messageId: string, outcome: HostOutcome, unit: Partial<HostUnitOfWork> = {}): Promise<void> {
  const claim = kernel.dispatcher.running.get(messageId);
  if (claim === undefined) throw new Error(`${messageId} is not running`);
  kernel.dispatcher.running.delete(messageId);
  const frame: CompleteFrame = { frame: 'complete', invocationId: ulids.next(), outcome, unitOfWork: { ...emptyUnit, ...unit }, recorded: { id: [], now: [] } };
  await kernel.settlement.completed({ claim, live: new Map() }, frame);
  await quiesce();
}

// A person sends a command, as an HTTP caller would (12 §12.2).
export async function submit(kernel: ModelKernel, type: string, payload: Json): Promise<string> {
  const submission = await kernel.adapter.submitCommand({ sender: { address: 'user:local' }, workspaceId: workspaceA, idempotencyKey: ulids.next(), type, payload });
  if (!submission.ok) throw new Error(`${type} was not admitted: ${submission.problem.code}`);
  await quiesce();
  return submission.id;
}
