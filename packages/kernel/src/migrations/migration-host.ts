import {
  hostToKernelFrameSchema, type Isolation, type JsonObject, type Manifest, type MigrationConfigWrite, type MigrationWrite, type Problem, type RpcCall, type RpcResult,
} from '@kvman/protocol';
import type { HostThread, StartHostThread } from '../hosts/host-thread.ts';
import { redactFields, redactText, type KernelLogger } from '../hosts/kernel-logger.ts';
import type { VerifiedSnapshot } from '../hosts/snapshot-gate.ts';
import { kernelProblem } from '../problems.ts';
import type { SchedulerTimers, TimerHandle } from '../scheduler/timers.ts';
import { readConfigRow } from '../storage/config-rows.ts';
import type { Connection } from '../storage/driver.ts';
import type { UlidGenerator } from '../ulid.ts';
import { readMigrationRows } from './migration-rows.ts';

// ADR 0143: a step still running after 10 minutes fails; 2 s later its host is treated as stuck and stopped.
export const migrationLimits = { stepMs: 10 * 60_000, stuckGraceMs: 2000 } as const;

export type MigrationHostOptions = {
  connection: Connection;
  startThread: StartHostThread;
  startSandbox: (snapshotFolder: string) => StartHostThread;
  timers: SchedulerTimers;
  now: () => number;
  ids: UlidGenerator;
  logger: KernelLogger;
};

// The code a migration runs: the target digest's verified snapshot and manifest, at the isolation it gets (04 §4.8).
export type MigrationTarget = { extension: string; manifest: Manifest; snapshot: VerifiedSnapshot; isolation: Isolation };

export type StepOutcome = { ok: true; writes: MigrationWrite[]; config: MigrationConfigWrite[] } | { ok: false; problem: Problem };

type RunningStep = { id: string; correlationId: string; resolve: (outcome: StepOutcome) => void; deadline: TimerHandle };

// A host of its own for one migration's steps (04 §4.8): a worker thread for shared and dedicated isolation, a
// sandboxed process otherwise. Its calls are served from the migrating extension's own rows and config; a crash or a
// timeout fails the running step, never charged as a host failure (ADR 0143).
export class MigrationHost {
  readonly #options: MigrationHostOptions;
  readonly #target: MigrationTarget;
  readonly #thread: HostThread;
  #step: RunningStep | undefined;
  #stopped = false;
  #ended = false;

  constructor(options: MigrationHostOptions, target: MigrationTarget) {
    this.#options = options;
    this.#target = target;
    const start = target.isolation === 'sandboxed' ? options.startSandbox(target.snapshot.folder) : options.startThread;
    this.#thread = start({ frame: (value) => this.#frame(value), failed: () => this.#hostFailed(), exit: () => this.#exited() });
  }

  get isolation(): Isolation {
    return this.#target.isolation;
  }

  get extension(): string {
    return this.#target.extension;
  }

  step(to: number, correlationId: string): Promise<StepOutcome> {
    const { timers, now, ids } = this.#options;
    const id = ids.next();
    if (this.#ended) return Promise.resolve(this.#failed('the migration host ended before the step'));
    return new Promise((resolve) => {
      const deadline = timers.set(migrationLimits.stepMs, () => this.#timedOut());
      this.#step = { id, correlationId, resolve, deadline };
      const { extension, manifest, snapshot } = this.#target;
      this.#thread.post({ frame: 'migrate', invocationId: id, extension, to, deadlineAt: now() + migrationLimits.stepMs, correlationId, module: { entry: snapshot.entry, manifest } });
    });
  }

  // A step still running when the kernel stops ends with KERNEL_STOPPING; boot resumes the migration (03 §3.9 step 5).
  stop(): void {
    this.#stopped = true;
    this.#finish({ ok: false, problem: kernelProblem('KERNEL_STOPPING', { correlationId: this.#step?.correlationId ?? this.#options.ids.next(), detail: 'the kernel stopped during a migration step' }) });
    this.#thread.terminate();
  }

  #finish(outcome: StepOutcome): void {
    const step = this.#step;
    if (step === undefined) return;
    this.#step = undefined;
    step.deadline.cancel();
    step.resolve(outcome);
  }

  #failed(detail: string): StepOutcome {
    return { ok: false, problem: kernelProblem('MIGRATION_FAILED', { correlationId: this.#step?.correlationId ?? this.#options.ids.next(), detail }) };
  }

  #timedOut(): void {
    const step = this.#step;
    if (step === undefined) return;
    this.#thread.post({ frame: 'abort', invocationId: step.id, reason: 'timeout' });
    this.#finish(this.#failed(`the step ran out of time after ${migrationLimits.stepMs / 60_000} minutes`));
    this.#options.timers.set(migrationLimits.stuckGraceMs, () => this.stop());
  }

  #exited(): void {
    this.#ended = true;
    if (!this.#stopped) this.#finish(this.#failed('the migration host ended during the step'));
  }

  // A host the kernel stopped fails its pipe on purpose; only an unexpected failure is logged.
  #hostFailed(): void {
    if (!this.#stopped) this.#log('warn', 'a migration host failed');
  }

  #frame(value: unknown): void {
    const parsed = hostToKernelFrameSchema.safeParse(value);
    const step = this.#step;
    if (!parsed.success || step === undefined || this.#stopped) return;
    const frame = parsed.data;
    if (frame.invocationId !== step.id) return;
    if (frame.frame === 'rpc') this.#thread.post({ frame: 'rpcResult', invocationId: step.id, callId: frame.callId, result: this.#serve(frame.call, step.correlationId) });
    else if (frame.frame === 'migrated') this.#finish(frame.outcome.ok ? { ok: true, writes: frame.writes, config: frame.config } : { ok: false, problem: frame.outcome.problem });
    else if (frame.frame === 'loadFailed') this.#finish({ ok: false, problem: frame.problem });
  }

  #serve(call: RpcCall, correlationId: string): RpcResult {
    const { connection } = this.#options;
    const { manifest, extension } = this.#target;
    if (call.name === 'migration.rows') {
      const answer = readMigrationRows(connection, manifest, call, correlationId);
      return answer.ok ? { ok: true, value: answer.rows } : { ok: false, problem: answer.problem };
    }
    if (call.name === 'migration.config.get') {
      const row = readConfigRow(connection, extension, call.scope === 'global' ? undefined : call.workspaceId);
      return row.revision === 0 ? { ok: true } : { ok: true, value: row.value };
    }
    if (call.name === 'log') {
      this.#log(call.level, redactText(call.message), redactFields(call.fields ?? {}));
      return { ok: true };
    }
    return { ok: false, problem: kernelProblem('CAPABILITY_DENIED', { correlationId, detail: `a migration step may not call ${call.name}`, hint: 'a migration acts through m only' }) };
  }

  #log(level: 'debug' | 'info' | 'warn' | 'error', message: string, fields: JsonObject = {}): void {
    this.#options.logger.write({ level, message, fields: { ...fields, extension: this.#target.extension }, attributes: { correlationId: this.#step?.correlationId ?? this.#options.ids.next() } });
  }
}
