import type { CompleteFrame, HostOutcome, HostUnitOfWork, Json } from '@kvman/protocol';
import {
  AdapterPath, betterSqlite3Driver, CommitPipeline, KernelHost, kernelOwner, KernelRegistry, LiveBus, openKernelDatabase, PayloadValidators, PendingIndex,
  Quarantines, QueryPath, recoverInterrupted, RecordedValueStore, RegistryState, ReplyWaiters, Router, Scheduler, Settlement,
  type Claim, type Connection, type Dispatcher, type HostLoad, type RegistryInput,
} from '../../src/index.ts';
import { manifest, workspaceA } from '../registry/manifests.ts';
import { MapGrants } from '../router/harness.ts';
import { ulids } from '../storage/harness.ts';
import { ManualTimers, startTime, type TestTime } from '../scheduler/doubles.ts';

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

function registryInput(): RegistryInput {
  return { extensions: [{ manifest: model, quarantined: false }], enabled: new Map([[workspaceA, [modelExtension]]]) };
}

// Every commit is applied as it is enqueued (one unit per batch), so nothing waits on a real timer.
export async function bootModelKernel(file: string, time: TestTime = { value: startTime }): Promise<ModelKernel> {
  const connection = openKernelDatabase(file, betterSqlite3Driver, ulids.next());
  const now = (): number => time.value;
  const registry = new RegistryState(registryInput(), connection);
  const current = (): KernelRegistry => registry.current();
  const grants = new MapGrants();
  grants.grant(modelExtension, workspaceA, {});
  const router = new Router({ registry: current, grants, validators: new PayloadValidators(), ids: ulids, now, defaultLocale: () => 'en' });
  const index = PendingIndex.rebuild(connection, now);
  const pipeline = new CommitPipeline({ connection, admission: router, now, maxBatchUnits: 1 });
  const waiters = new ReplyWaiters(connection);
  const timers = new ManualTimers(time);
  const dispatcher = new ModelDispatcher();
  const scheduler = new Scheduler({
    connection, pipeline, index, registry: current, dispatcher, now, timers,
    onCommitted: (result) => {
      if (result.committed) waiters.resolve(result.replies);
    },
  });
  const queries = new QueryPath(router, scheduler);
  const settlement = new Settlement({
    pipeline, scheduler, waiters, queries, live: new LiveBus(), values: new RecordedValueStore(connection), quarantines: new Quarantines(pipeline, registry, ulids),
  });
  dispatcher.kernel = new KernelHost({
    connection, pipeline, scheduler, waiters, grants, queries, abortMessages: (ids) => dispatcher.abort(ids),
    health: () => ({ status: 'ok', version: '0.0.0', instanceId: '0b5c7f2e-4a1d-4c3b-9e8f-1a2b3c4d5e6f', processStart: 'x', uptimeMs: 0, port: 4173, home: '/h' }),
    requestShutdown: () => undefined,
  });
  const recovered = await recoverInterrupted({ connection, pipeline, registry: current, now });
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

const emptyUnit: HostUnitOfWork = { writes: [], sends: [], publishes: [], replies: [] };

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
