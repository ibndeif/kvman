import type { RpcCall, RpcResult, StoreRead } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { UlidGenerator } from '../ulid.ts';
import type { ActiveInvocation } from './active-invocation.ts';
import { abortProblem } from './aborted-invocations.ts';
import type { HostRegistry } from './host-registry.ts';
import type { InvocationSink } from './invocation-sink.ts';
import type { ReadPool } from './read-pool/read-pool.ts';
import type { RunningInvocations } from './running-invocations.ts';
import { serveStoreRead } from './store-read-calls.ts';
import type { PoolWorker } from './worker-pool.ts';

export type HostCallsDeps = {
  running: RunningInvocations;
  hosts: HostRegistry;
  reads: ReadPool;
  ids: UlidGenerator;
  sink: () => InvocationSink;
  track: (work: Promise<unknown>) => void;
};

// A host's `rpc` frames (03 §3.5): reads go to the read pool (ADR 0131), every other call to the invocation sink, and
// each is answered only while its invocation runs.
export class HostCalls {
  readonly #deps: HostCallsDeps;

  constructor(deps: HostCallsDeps) {
    this.#deps = deps;
  }

  // A call from an invocation that ended is answered with the problem that ended it (ADRs 0076, 0084).
  call(worker: PoolWorker, invocationId: string, callId: number, call: RpcCall): void {
    const { running, hosts, ids, track } = this.#deps;
    const invocation = running.on(worker, invocationId);
    if (invocation === undefined) {
      const aborted = running.abortedOn(worker, invocationId);
      const problem = aborted === undefined
        ? kernelProblem('INTERNAL', { correlationId: ids.next(), detail: 'the invocation has ended' })
        : abortProblem(aborted);
      hosts.post(worker, { frame: 'rpcResult', invocationId, callId, result: { ok: false, problem } });
      return;
    }
    if (call.name === 'store.read') track(this.#read(invocation, callId, call.read));
    else track(this.#deps.sink().called(invocation, call).then((result) => this.#answer(invocation, callId, result)));
  }

  async #read(invocation: ActiveInvocation, callId: number, read: StoreRead): Promise<void> {
    const outcome = await serveStoreRead(this.#deps.reads, invocation.worker, invocation, read);
    if (!outcome.ok) this.#answer(invocation, callId, outcome);
    else if (this.#deps.running.isRunning(invocation)) invocation.worker.thread.postValue?.(invocation.id, callId, outcome.value);
  }

  #answer(invocation: ActiveInvocation, callId: number, result: RpcResult): void {
    if (this.#deps.running.isRunning(invocation)) this.#deps.hosts.post(invocation.worker, { frame: 'rpcResult', invocationId: invocation.id, callId, result });
  }
}
