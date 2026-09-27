import type { SchedulerTimers } from '../scheduler/timers.ts';
import type { ActiveInvocation } from './active-invocation.ts';
import type { HostRegistry } from './host-registry.ts';
import type { InvocationSink } from './invocation-sink.ts';
import type { RunningInvocations } from './running-invocations.ts';

export type ReplacementDeps = {
  running: RunningInvocations;
  hosts: HostRegistry;
  timers: SchedulerTimers;
  sink: () => InvocationSink;
  track: (work: Promise<unknown>) => void;
  end: (invocation: ActiveInvocation) => void;
};

// 06 §6.6 steps 3 and 5: a reload lets the extension's running invocations finish, and replaces every host that
// loaded its old code once the invocations on it end. Whatever still runs after the grace is aborted and returns to
// pending without an attempt, as at shutdown (ADR 0145).
export class ExtensionReplacement {
  readonly #deps: ReplacementDeps;
  readonly #waiters = new Set<() => void>();

  constructor(deps: ReplacementDeps) {
    this.#deps = deps;
  }

  // An invocation ended: waits that it completes resolve.
  ended(): void {
    for (const check of [...this.#waiters]) check();
  }

  drain(extension: string, graceMs: number): Promise<void> {
    return this.#settle((invocation) => invocation.claim.extension === extension, graceMs);
  }

  // The retired hosts take nothing new at once, so dispatch may resume on fresh ones; each stops after its own
  // invocations end.
  replace(extension: string, graceMs: number): void {
    const retired = new Set(this.#deps.hosts.retire(extension));
    this.#deps.track(this.#settle((invocation) => retired.has(invocation.worker), graceMs).then(() => {
      for (const worker of retired) this.#deps.hosts.stop(worker);
    }));
  }

  #settle(matches: (invocation: ActiveInvocation) => boolean, graceMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        grace.cancel();
        this.#waiters.delete(check);
        resolve();
      };
      const check = (): void => {
        if (!this.#deps.running.all().some(matches)) done();
      };
      const grace = this.#deps.timers.set(graceMs, () => {
        for (const invocation of this.#deps.running.all().filter(matches)) this.#interrupt(invocation);
        done();
      });
      this.#waiters.add(check);
      check();
    });
  }

  #interrupt(invocation: ActiveInvocation): void {
    this.#deps.end(invocation);
    this.#deps.hosts.post(invocation.worker, { frame: 'abort', invocationId: invocation.id, reason: 'cancelled' });
    this.#deps.track(this.#deps.sink().interrupted(invocation));
  }
}
