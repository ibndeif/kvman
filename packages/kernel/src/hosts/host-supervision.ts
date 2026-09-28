import type { ActiveInvocation } from './active-invocation.ts';
import type { HostFailures } from './host-failures.ts';
import type { HostRegistry } from './host-registry.ts';
import type { InvocationSink } from './invocation-sink.ts';
import type { ProviderInvocations } from './provider-invocations.ts';
import type { RunningInvocations } from './running-invocations.ts';
import type { PoolWorker } from './worker-pool.ts';

export type HostSupervisionDeps = {
  running: RunningInvocations;
  hosts: HostRegistry;
  providers: ProviderInvocations;
  failures: HostFailures;
  now: () => number;
  sink: () => InvocationSink;
  track: (work: Promise<unknown>) => void;
  end: (invocation: ActiveInvocation) => void;
};

// 03 §3.6: stuck invocations and crashed hosts, and the charges that quarantine an extension (ADRs 0082, 0084).
export class HostSupervision {
  readonly #deps: HostSupervisionDeps;

  constructor(deps: HostSupervisionDeps) {
    this.#deps = deps;
  }

  // The stuck invocation's extension is charged; the rest of the host returns without penalty.
  stuck(invocation: ActiveInvocation): void {
    const { running, hosts } = this.#deps;
    if (!running.isAborted(invocation)) return;
    const { worker } = invocation;
    this.charge(invocation.claim.extension);
    for (const other of running.runningOn(worker)) {
      this.#deps.end(other);
      this.#deps.track(this.#deps.sink().collateral(other));
    }
    running.forgetAborted(worker);
    hosts.stop(worker);
  }

  // ADR 0082: a crash charges every extension running on the host, and each attempt counts; its provider calls end
  // as retryable failures (ADR 0153).
  exited(worker: PoolWorker): void {
    const { running } = this.#deps;
    const invocations = running.runningOn(worker);
    for (const extension of new Set(invocations.map((invocation) => invocation.claim.extension))) this.charge(extension);
    for (const invocation of invocations) {
      this.#deps.end(invocation);
      this.#deps.track(this.#deps.sink().lost(invocation));
    }
    running.forgetAborted(worker);
    this.#deps.providers.lost(worker);
  }

  charge(extension: string): void {
    if (this.#deps.failures.charge(extension, this.#deps.now())) this.#deps.track(this.#deps.sink().quarantine(extension, 'HOST_FAILURES'));
  }
}
