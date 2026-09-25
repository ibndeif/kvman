import { kernelToHostFrameSchema, type CompleteFrame, type HostToKernelFrame, type InvokeFrame } from '@kvman/protocol';
import { kernelProblem } from '../../problems.ts';
import { betterSqlite3Driver } from '../../storage/better-sqlite3-driver.ts';
import { openReadConnection } from '../../storage/database.ts';
import { UnindexedScanThrottle } from '../../store/store-context.ts';
import { StoreReader } from '../../store/store-reader.ts';
import { createUlidGenerator } from '../../ulid.ts';
import { loadExtension, type ModuleLoad } from './extension-module.ts';
import { runInvocation } from './invocation-run.ts';
import { RpcClient } from './rpc-client.ts';

// One shared worker (03 §3.5): it loads extensions lazily, once each (ADR 0071), reads through its own read-only
// connection, and runs up to its cap of invocations at a time.
export class WorkerRuntime {
  readonly #post: (frame: HostToKernelFrame) => void;
  readonly #client: RpcClient;
  readonly #reader: StoreReader;
  readonly #throttle = new UnindexedScanThrottle(Date.now);
  readonly #ids = createUlidGenerator(Date.now);
  readonly #modules = new Map<string, Promise<ModuleLoad>>();

  constructor(post: (frame: HostToKernelFrame) => void, databaseFile: string) {
    this.#post = post;
    this.#client = new RpcClient(post);
    this.#reader = new StoreReader(openReadConnection(databaseFile, betterSqlite3Driver));
  }

  // The kernel is trusted to send valid frames; one that is not is a kernel bug and ends this worker.
  receive(value: unknown): void {
    const frame = kernelToHostFrameSchema.parse(value);
    if (frame.frame === 'rpcResult') this.#client.answered(frame);
    else void this.#invoke(frame);
  }

  async #invoke(invoke: InvokeFrame): Promise<void> {
    const load = await this.#load(invoke);
    this.#post(load.ok ? await this.#run(invoke, load) : this.#failed(invoke, load));
  }

  #run(invoke: InvokeFrame, load: Extract<ModuleLoad, { ok: true }>): Promise<CompleteFrame> {
    return runInvocation({
      invoke, extension: load.extension, client: this.#client, reader: this.#reader, throttle: this.#throttle,
      newId: () => this.#ids.next(), clock: Date.now,
    });
  }

  #failed(invoke: InvokeFrame, load: Extract<ModuleLoad, { ok: false }>): CompleteFrame {
    const problem = { ...load.problem, correlationId: invoke.message.correlationId, messageId: invoke.message.id };
    return { frame: 'complete', invocationId: invoke.invocationId, outcome: { ok: false, problem }, unitOfWork: { writes: [], sends: [], publishes: [], replies: [] }, recorded: { id: [], now: [] } };
  }

  #load(invoke: InvokeFrame): Promise<ModuleLoad> {
    const existing = this.#modules.get(invoke.extension);
    if (existing !== undefined) return existing;
    const { module } = invoke;
    if (module === undefined) {
      const problem = kernelProblem('INTERNAL', { correlationId: invoke.message.correlationId, detail: `${invoke.extension} was never sent to this worker` });
      return Promise.resolve({ ok: false, problem });
    }
    const loading = loadExtension(module.entry, module.manifest, invoke.message.correlationId);
    this.#modules.set(invoke.extension, loading);
    return loading;
  }
}
