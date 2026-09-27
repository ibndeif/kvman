import { mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { processLimits, type Message, type ProcessResult } from '@kvman/protocol';
import type { BlobStore } from '../blobs/blob-store.ts';
import { readProcessStart } from '../daemon/process-identity.ts';
import type { FaultPoints } from '../faults/fault-points.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import type { LiveAddress, LiveBus } from '../hosts/live-bus.ts';
import type { SchedulerTimers, TimerHandle } from '../scheduler/timers.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { Connection } from '../storage/driver.ts';
import { insertProcess, markTruncated, type ProcessRecord } from '../storage/process-rows.ts';
import { inWriteTransaction } from '../storage/write-transaction.ts';
import { groupAlive, signalGroup, spawnGated, type GatedChild } from './gated-spawn.ts';
import type { JobTokens, TokenGrant } from './job-tokens.ts';
import { commitEnd, finalizeLog, removeLog } from './process-endings.ts';
import { environmentFor } from './process-environment.ts';
import { ProcessOutput } from './process-output.ts';

export type SupervisorDeps = {
  home: string;
  connection: Connection;
  pipeline: CommitPipeline;
  store: BlobStore;
  live: LiveBus;
  tokens: JobTokens;
  // The daemon's own environment, which processes inherit without its KVMAN_* variables (ADR 0139).
  environment: NodeJS.ProcessEnv;
  timers: SchedulerTimers;
  now: () => number;
  logger: KernelLogger;
  faults: FaultPoints;
};

// A spawn the process calls checked and resolved (ADR 0139): the folder is real and jailed, the options valid.
export type SpawnPlan = {
  processId: string;
  extension: string;
  invocationId: string;
  message: Message;
  command: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  stdin: string | undefined;
  logCapBytes: number;
  timeoutMs: number | undefined;
  detached: boolean;
  onExit: string | undefined;
  live: LiveAddress | undefined;
  token: Omit<TokenGrant, 'processId'> | undefined;
};

// `killed` is set by a kill path; `exited` once the leader has exited, after which only its group is ended.
type Supervised = {
  record: ProcessRecord;
  child: GatedChild;
  output: ProcessOutput;
  invocationId: string;
  killed: boolean;
  exited: boolean;
  timers: TimerHandle[];
  finished: Promise<ProcessResult | undefined>;
};

function isBrokenPipe(error: Error): boolean {
  return 'code' in error && error.code === 'EPIPE';
}

export class ProcessStartFailed extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'ProcessStartFailed';
  }
}

// 03 §3.7: the kernel's process supervisor. Every process runs in its own group, recorded before it is released, with
// its output capped into a log, and ends through one path that finalizes the log into a blob and commits the row's
// end with a detached process's onExit.
export class ProcessSupervisor {
  readonly #deps: SupervisorDeps;
  readonly #running = new Map<string, Supervised>();
  // Ended processes of invocations still running, so wait() answers the same result again.
  readonly #results = new Map<string, { invocationId: string; result: ProcessResult }>();
  readonly #invocations = new Set<string>();
  #stopping = false;

  constructor(deps: SupervisorDeps) {
    this.#deps = deps;
  }

  get jobsFolder(): string {
    return join(this.#deps.home, 'jobs');
  }

  async spawn(plan: SpawnPlan): Promise<void> {
    const { connection, tokens, timers, now, faults } = this.#deps;
    mkdirSync(this.jobsFolder, { recursive: true, mode: 0o700 });
    const token = plan.token === undefined ? undefined : tokens.issue({ processId: plan.processId, ...plan.token });
    const child = await this.#start(plan, token);
    const processStart = await this.#identify(child, plan.processId);
    const record: ProcessRecord = {
      processId: plan.processId, messageId: plan.message.id, extension: plan.extension, workspaceId: plan.message.workspaceId, command: plan.command,
      pid: child.pid, processStart, logPath: join(this.jobsFolder, `${plan.processId}.log`), detached: plan.detached, onExit: plan.onExit,
      spawnedBy: plan.message, startedAt: now(),
    };
    const output = new ProcessOutput({
      logPath: record.logPath, capBytes: plan.logCapBytes, timers, truncated: () => inWriteTransaction(connection, () => markTruncated(connection, plan.processId)),
      ...(plan.live === undefined ? {} : { live: this.#liveSink(plan.live, plan.message.id) }),
    });
    inWriteTransaction(connection, () => insertProcess(connection, record));
    faults.reach('process.after-spawn-before-release');
    child.output.on('data', (chunk: Buffer) => output.write(chunk));
    const closed = once(child.output, 'close');
    child.release();
    faults.reach('process.after-release');
    // A process that exits without reading its stdin breaks the pipe: its choice, not a failure of the kernel.
    child.stdin.on('error', (error) => {
      if (!isBrokenPipe(error)) this.#logFailure(record, 'the stdin of a process could not be written', error);
    });
    child.stdin.end(plan.stdin ?? '');
    const supervised: Supervised = {
      record, child, output, invocationId: plan.invocationId, killed: false, exited: false, timers: [], finished: Promise.resolve(undefined),
    };
    this.#running.set(plan.processId, supervised);
    this.#invocations.add(plan.invocationId);
    const limit = plan.timeoutMs ?? (plan.detached ? processLimits.detachedTimeoutMs : undefined);
    if (limit !== undefined) supervised.timers.push(timers.set(limit, () => this.#kill(supervised)));
    supervised.finished = this.#finish(supervised, closed).catch((error: unknown) => {
      this.#running.delete(plan.processId);
      this.#logFailure(record, 'the end of a process could not be recorded', error instanceof Error ? error : new Error('unknown'));
      return undefined;
    });
  }

  // The result of a process this invocation spawned, once it ends; undefined for any other process.
  wait(processId: string, invocationId: string): Promise<ProcessResult | undefined> | undefined {
    const ended = this.#results.get(processId);
    if (ended !== undefined) return ended.invocationId === invocationId ? Promise.resolve(ended.result) : undefined;
    const running = this.#running.get(processId);
    return running?.invocationId === invocationId ? running.finished : undefined;
  }

  // ctx.process.kill: a live process the extension owns; `ended` and `unknown` are the caller's to judge.
  kill(processId: string, extension: string): 'killed' | 'not-running' {
    const running = this.#running.get(processId);
    if (running === undefined || running.record.extension !== extension) return 'not-running';
    this.#kill(running);
    return 'killed';
  }

  // The invocation ended (02 §2.12): its processes that are not detached end with it (ADR 0139).
  invocationEnded(invocationId: string): void {
    for (const running of this.#running.values()) {
      if (running.invocationId === invocationId && !running.record.detached) this.#kill(running);
    }
    for (const [processId, ended] of this.#results) {
      if (ended.invocationId === invocationId) this.#results.delete(processId);
    }
    this.#invocations.delete(invocationId);
  }

  // kernel.cancel (02 §2.9): the processes the cancelled messages started, detached ones included.
  killSpawnedBy(messageIds: ReadonlySet<string>): void {
    for (const running of this.#running.values()) if (messageIds.has(running.record.messageId)) this.#kill(running);
  }

  // Quarantine of the owner (03 §3.7).
  killExtension(extension: string): void {
    for (const running of this.#running.values()) if (running.record.extension === extension) this.#kill(running);
  }

  // Forget (04 §4.4 step 2, ADR 0139): resolves once every killed process's end and onExit committed.
  async killWorkspace(workspaceId: string): Promise<void> {
    const killed = [...this.#running.values()].filter((running) => running.record.workspaceId === workspaceId);
    for (const running of killed) this.#kill(running);
    await Promise.all(killed.map((running) => running.finished));
  }

  // Shutdown (03 §3.9): every group is killed and its row left running for the next boot's reconciliation.
  async stop(): Promise<void> {
    this.#stopping = true;
    const running = [...this.#running.values()];
    for (const supervised of running) this.#kill(supervised);
    await Promise.all(running.map((supervised) => supervised.finished));
  }

  async #start(plan: SpawnPlan, token: string | undefined): Promise<GatedChild> {
    try {
      return await spawnGated({ command: plan.command, args: plan.args, cwd: plan.cwd, env: environmentFor(this.#deps.environment, plan.env, this.#deps.home, token) });
    } catch (error) {
      this.#deps.tokens.revoke(plan.processId);
      throw new ProcessStartFailed(`the process could not be started (${error instanceof Error && 'code' in error ? String(error.code) : 'unknown'})`);
    }
  }

  async #identify(child: GatedChild, processId: string): Promise<string> {
    const processStart = await readProcessStart(child.pid).catch((error: unknown) => {
      child.abandon();
      this.#deps.tokens.revoke(processId);
      throw error;
    });
    if (processStart !== undefined) return processStart;
    child.abandon();
    this.#deps.tokens.revoke(processId);
    throw new ProcessStartFailed('ps does not list the started process');
  }

  #liveSink(address: LiveAddress, run: string): (text: string) => void {
    return (text) => this.#deps.live.publish(address, run, { text });
  }

  #kill(supervised: Supervised): void {
    if (supervised.killed || supervised.exited) return;
    supervised.killed = true;
    this.#terminate(supervised);
  }

  // SIGTERM to the group, then SIGKILL after 3 s to whatever is left (03 §3.7).
  #terminate(supervised: Supervised): void {
    const { pid, processId } = supervised.record;
    signalGroup(pid, 'SIGTERM');
    supervised.timers.push(this.#deps.timers.set(processLimits.killGraceMs, () => {
      if (this.#running.has(processId) && groupAlive(pid)) signalGroup(pid, 'SIGKILL');
    }));
  }

  // The leader exited: the rest of its group ends with it, then the output pipe closes and the end commits.
  async #finish(supervised: Supervised, closed: Promise<unknown>): Promise<ProcessResult | undefined> {
    const { record, child, output } = supervised;
    const exit = await child.exited;
    supervised.exited = true;
    if (groupAlive(record.pid)) this.#terminate(supervised);
    await closed;
    const summary = await output.finish();
    for (const timer of supervised.timers) timer.cancel();
    this.#deps.tokens.revoke(record.processId);
    if (output.failure !== undefined) this.#logFailure(record, 'the log of a process could not be written', output.failure);
    if (this.#stopping) {
      this.#running.delete(record.processId);
      return undefined;
    }
    const endedAt = this.#deps.now();
    const logBlobId = await finalizeLog(this.#deps.store, record);
    const result: ProcessResult = { ...exit, logBlobId, tail: summary.tail, truncated: summary.truncated, durationMs: Math.max(0, endedAt - record.startedAt) };
    const end = { processId: record.processId, reason: supervised.killed ? 'killed' as const : 'exited' as const, ...exit, logBlobId, truncated: summary.truncated, endedAt };
    this.#deps.faults.reach('process.after-exit-before-onexit');
    const committed = await commitEnd(this.#deps, record, end, result);
    if (committed.committed) removeLog(record.logPath);
    else this.#logFailure(record, 'the end of a process did not commit', new Error(committed.problem.code));
    this.#running.delete(record.processId);
    if (this.#invocations.has(supervised.invocationId)) this.#results.set(record.processId, { invocationId: supervised.invocationId, result });
    return result;
  }

  #logFailure(record: ProcessRecord, message: string, error: Error): void {
    this.#deps.logger.write({
      level: 'error', message, fields: { processId: record.processId, error: error.message },
      attributes: { correlationId: record.spawnedBy.correlationId, messageId: record.messageId, extension: record.extension },
    });
  }
}
