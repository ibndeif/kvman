import {
  kernelToHostFrameSchema, type AbortReason, type CompleteFrame, type HostToKernelFrame, type InvokeFrame, type LoadFailedFrame, type MigrateFrame,
  type ProvideFrame,
} from '@kvman/protocol';
import { kernelProblem } from '../../problems.ts';
import { UnindexedScanThrottle } from '../../store/store-context.ts';
import type { StoreReads } from '../../store/store-reads.ts';
import { createUlidGenerator } from '../../ulid.ts';
import { loadExtension, type ModuleLoad } from './extension-module.ts';
import { InvocationState } from './invocation-state.ts';
import { runInvocation } from './invocation-run.ts';
import { runMigration } from './migration-run.ts';
import { runProvider } from './provider-run.ts';
import { RpcClient } from './rpc-client.ts';

// How a host reads committed rows for one invocation.
export type HostReads = (client: RpcClient, invocationId: string) => StoreReads;

// One execution host (03 §3.5): a shared or dedicated worker, or a sandboxed process. It loads extensions lazily, once
// each (ADR 0071), reads through its own read-only connection or the kernel's read pool (ADR 0131), and runs up to its
// cap of invocations at a time.
export class WorkerRuntime {
  readonly #post: (frame: HostToKernelFrame) => void;
  readonly #client: RpcClient;
  readonly #reads: HostReads;
  readonly #throttle = new UnindexedScanThrottle(Date.now);
  readonly #ids = createUlidGenerator(Date.now);
  readonly #modules = new Map<string, Promise<ModuleLoad>>();
  readonly #running = new Map<string, InvocationState>();
  readonly #migrations = new Set<string>();
  readonly #providers = new Map<string, AbortController>();

  constructor(post: (frame: HostToKernelFrame) => void, reads: HostReads) {
    this.#post = post;
    this.#client = new RpcClient(post);
    this.#reads = reads;
  }

  // The kernel is trusted to send valid frames; one that is not is a kernel bug and ends this worker.
  receive(value: unknown): void {
    const frame = kernelToHostFrameSchema.parse(value);
    if (frame.frame === 'rpcResult') this.#client.answered(frame);
    else if (frame.frame === 'abort') this.#abort(frame.invocationId, frame.reason);
    else if (frame.frame === 'migrate') void this.#migrate(frame);
    else if (frame.frame === 'provide') void this.#provide(frame);
    else void this.#invoke(frame);
  }

  // ADR 0143: an aborted migration step's calls in flight end, so the step unwinds; the kernel has already failed it.
  #abort(invocationId: string, reason: AbortReason): void {
    if (this.#migrations.has(invocationId)) {
      this.#client.abandon(invocationId, kernelProblem('MIGRATION_FAILED', { correlationId: this.#ids.next(), detail: 'the migration step ran out of time' }));
      return;
    }
    const provider = this.#providers.get(invocationId);
    if (provider !== undefined) {
      provider.abort(reason);
      this.#client.abandon(invocationId, kernelProblem(reason === 'deadline' ? 'DEADLINE_EXCEEDED' : 'CANCELLED', { correlationId: this.#ids.next(), detail: `the provider call was ${reason === 'deadline' ? 'past its deadline' : 'stopped'}` }));
      return;
    }
    const state = this.#running.get(invocationId);
    state?.abort(reason);
    const problem = state?.abortProblem?.problem;
    if (problem !== undefined) this.#client.abandon(invocationId, problem);
  }

  async #migrate(frame: MigrateFrame): Promise<void> {
    this.#migrations.add(frame.invocationId);
    const load = await this.#loadModule(frame.extension, frame.module, frame.correlationId);
    this.#post(load.ok ? await runMigration(frame, load.extension, this.#client) : { frame: 'loadFailed', invocationId: frame.invocationId, problem: load.problem });
    this.#migrations.delete(frame.invocationId);
  }

  // 03 §3.12, ADR 0153: a provider function runs with the caller's signal; the kernel aborts it on cancel or deadline.
  async #provide(frame: ProvideFrame): Promise<void> {
    const controller = new AbortController();
    this.#providers.set(frame.invocationId, controller);
    const load = await this.#loadModule(frame.extension, frame.module, frame.correlationId);
    this.#post(load.ok
      ? await runProvider(frame, load.extension, this.#client, controller.signal, this.#post)
      : { frame: 'provided', invocationId: frame.invocationId, outcome: { ok: false, problem: load.problem } });
    this.#providers.delete(frame.invocationId);
  }

  async #invoke(invoke: InvokeFrame): Promise<void> {
    const state = new InvocationState(invoke);
    this.#running.set(invoke.invocationId, state);
    const load = await this.#load(invoke);
    this.#post(load.ok ? await this.#run(invoke, state, load) : this.#failed(invoke, load));
    this.#running.delete(invoke.invocationId);
  }

  #run(invoke: InvokeFrame, state: InvocationState, load: Extract<ModuleLoad, { ok: true }>): Promise<CompleteFrame> {
    return runInvocation({
      invoke, state, extension: load.extension, client: this.#client, reader: this.#reads(this.#client, invoke.invocationId), throttle: this.#throttle,
      newId: () => this.#ids.next(), clock: Date.now,
    });
  }

  #failed(invoke: InvokeFrame, load: Extract<ModuleLoad, { ok: false }>): LoadFailedFrame {
    const problem = { ...load.problem, correlationId: invoke.message.correlationId, messageId: invoke.message.id };
    return { frame: 'loadFailed', invocationId: invoke.invocationId, problem };
  }

  #load(invoke: InvokeFrame): Promise<ModuleLoad> {
    return this.#loadModule(invoke.extension, invoke.module, invoke.message.correlationId);
  }

  #loadModule(extension: string, module: InvokeFrame['module'], correlationId: string): Promise<ModuleLoad> {
    const existing = this.#modules.get(extension);
    if (existing !== undefined) return existing;
    if (module === undefined) {
      const problem = kernelProblem('INTERNAL', { correlationId, detail: `${extension} was never sent to this worker` });
      return Promise.resolve({ ok: false, problem });
    }
    const loading = loadExtension(module.entry, module.manifest, correlationId);
    this.#modules.set(extension, loading);
    return loading;
  }
}
