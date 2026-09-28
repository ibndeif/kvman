import type {
  AbortReason, HostWorkspace, Json, KernelToHostFrame, Problem, ProvidedFrame, ProvideFrame, ProviderDeltaFrame, RpcCall, RpcFrame, RpcResult,
} from '@kvman/protocol';
import { mergedConfig } from '../config/config-values.ts';
import { kernelProblem } from '../problems.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import type { SchedulerTimers, TimerHandle } from '../scheduler/timers.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import { readConfigRow } from '../storage/config-rows.ts';
import type { Connection } from '../storage/driver.ts';
import type { UlidGenerator } from '../ulid.ts';
import type { HostRegistry } from './host-registry.ts';
import { redactFields, redactText, type KernelLogger } from './kernel-logger.ts';
import type { ExtensionSnapshots } from './snapshot-gate.ts';
import type { PoolWorker } from './worker-pool.ts';
import { readWorkspace } from './workspace-rows.ts';

export type ProviderFunction = ProvideFrame['function'];

// One provider function to run for a call: its caller's workspace, deadline, and signal, and where deltas go.
export type ProviderCall = {
  extension: string;
  provider: string;
  function: ProviderFunction;
  input: Json;
  workspaceId: string | undefined;
  deadlineAt: number;
  correlationId: string;
  signal: AbortSignal;
  onDelta?: (delta: { text?: string; thinking?: string }) => void;
};

export type ProviderOutcome = { ok: true; value: Json } | { ok: false; problem: Problem };

export type ProviderInvocationsDeps = {
  connection: Connection;
  registry: () => KernelRegistry;
  hosts: HostRegistry;
  snapshots: ExtensionSnapshots;
  secrets: SecretStore;
  logger: KernelLogger;
  ids: UlidGenerator;
  timers: SchedulerTimers;
  now: () => number;
  // The module part of the frame for a worker that has not loaded the extension yet.
  moduleFor: (worker: PoolWorker, extension: string, entry: string) => Pick<ProvideFrame, 'module'>;
  quarantine: (extension: string) => Promise<void>;
};

type Run = { id: string; call: ProviderCall; worker: PoolWorker; workspace: HostWorkspace | null; deadline: TimerHandle; finish: (outcome: ProviderOutcome) => void };

// 03 §3.12, ADR 0153: provider functions run in their extension's host like an invocation of it: they take a host
// slot, end at the caller's deadline or cancel, and read only the provider extension's config and secrets.
export class ProviderInvocations {
  readonly #deps: ProviderInvocationsDeps;
  readonly #runs = new Map<string, Run>();

  constructor(deps: ProviderInvocationsDeps) {
    this.#deps = deps;
  }

  async invoke(call: ProviderCall): Promise<ProviderOutcome> {
    const { snapshots, hosts, ids } = this.#deps;
    if (call.signal.aborted) return { ok: false, problem: this.#problem(call, 'cancelled') };
    const snapshot = snapshots.verifiedEntry(call.extension) ?? ((await snapshots.verify(call.extension)) ? snapshots.verifiedEntry(call.extension) : undefined);
    if (snapshot === undefined) {
      await this.#deps.quarantine(call.extension);
      return { ok: false, problem: kernelProblem('EXT_INTEGRITY', { correlationId: call.correlationId, detail: `the snapshot of ${call.extension} does not match its digest` }) };
    }
    const workspace = call.workspaceId === undefined ? null : readWorkspace(this.#deps.connection, call.workspaceId) ?? null;
    const worker = hosts.acquire(call.extension, call.workspaceId);
    const id = ids.next();
    return new Promise<ProviderOutcome>((resolve) => {
      const onAbort = (): void => this.#abort(id, 'cancelled');
      const deadline = this.#deps.timers.set(Math.max(0, call.deadlineAt - this.#deps.now()), () => this.#abort(id, 'deadline'));
      const finish = (outcome: ProviderOutcome): void => {
        if (this.#runs.get(id) === undefined) return;
        this.#runs.delete(id);
        deadline.cancel();
        call.signal.removeEventListener('abort', onAbort);
        hosts.release(worker);
        resolve(outcome);
      };
      this.#runs.set(id, { id, call, worker, workspace, deadline, finish });
      call.signal.addEventListener('abort', onAbort);
      const frame: KernelToHostFrame = {
        frame: 'provide', invocationId: id, extension: call.extension, provider: call.provider, function: call.function, input: call.input,
        workspace, deadlineAt: call.deadlineAt, correlationId: call.correlationId, ...this.#deps.moduleFor(worker, call.extension, snapshot.entry),
      };
      hosts.post(worker, frame);
    });
  }

  // A provider run's delta or outcome; one of a run that already ended (aborted, or its host replaced) is dropped.
  receive(worker: PoolWorker, frame: ProviderDeltaFrame | ProvidedFrame): void {
    const run = this.#runs.get(frame.invocationId);
    if (run === undefined || run.worker !== worker) return;
    if (frame.frame === 'provided') run.finish(frame.outcome);
    else run.call.onDelta?.({ ...(frame.text === undefined ? {} : { text: frame.text }), ...(frame.thinking === undefined ? {} : { thinking: frame.thinking }) });
  }

  // An rpc call of a running provider run, answered here; whether the call was one.
  serve(worker: PoolWorker, frame: RpcFrame): boolean {
    const run = this.#runs.get(frame.invocationId);
    if (run === undefined || run.worker !== worker) return false;
    this.#deps.hosts.post(worker, { frame: 'rpcResult', invocationId: frame.invocationId, callId: frame.callId, result: this.#answer(run, frame.call) });
    return true;
  }

  // A host that exits ends its provider runs; the call may be retried like any lost attempt.
  lost(worker: PoolWorker): void {
    for (const run of [...this.#runs.values()].filter((candidate) => candidate.worker === worker)) {
      run.finish({ ok: false, problem: kernelProblem('LLM_CALL_FAILED', { correlationId: run.call.correlationId, detail: `the host of ${run.call.extension} stopped during the call`, retryable: true }) });
    }
  }

  // Shutdown: every provider run ends with KERNEL_STOPPING.
  stopAll(): void {
    for (const run of [...this.#runs.values()]) run.finish({ ok: false, problem: kernelProblem('KERNEL_STOPPING', { correlationId: run.call.correlationId }) });
  }

  #abort(id: string, reason: AbortReason): void {
    const run = this.#runs.get(id);
    if (run === undefined) return;
    this.#deps.hosts.post(run.worker, { frame: 'abort', invocationId: id, reason });
    run.finish({ ok: false, problem: this.#problem(run.call, reason) });
  }

  #problem(call: ProviderCall, reason: AbortReason): Problem {
    if (reason === 'deadline') return kernelProblem('DEADLINE_EXCEEDED', { correlationId: call.correlationId, detail: 'the call reached its deadline' });
    return kernelProblem('CANCELLED', { correlationId: call.correlationId, detail: 'the call was cancelled' });
  }

  // ADR 0153: a provider reads its own merged config for the call's workspace and its own secrets, and logs.
  #answer(run: Run, call: RpcCall): RpcResult {
    const { extension, workspaceId, correlationId } = run.call;
    if (call.name === 'config.get') {
      const schema = this.#deps.registry().manifestOf(extension)?.config?.schema ?? {};
      const global = readConfigRow(this.#deps.connection, extension, undefined).value;
      const workspace = workspaceId === undefined ? undefined : readConfigRow(this.#deps.connection, extension, workspaceId).value;
      return { ok: true, value: mergedConfig(schema, global, workspace) };
    }
    if (call.name === 'secret.get') {
      const value = this.#deps.secrets.get(extension, call.secret);
      return value === undefined ? { ok: true } : { ok: true, value };
    }
    if (call.name === 'log') {
      this.#deps.logger.write({
        level: call.level, message: redactText(call.message), fields: redactFields(call.fields ?? {}),
        attributes: { correlationId, extension, ...(workspaceId === undefined ? {} : { workspaceId }) },
      });
      return { ok: true };
    }
    return { ok: false, problem: kernelProblem('CAPABILITY_DENIED', { correlationId, detail: `a provider function cannot call ${call.name}` }) };
  }
}
