import type { ProcessExit, ProcessResult, ProcessToken, SpawnOptions } from '@kvman/protocol';

/** What `ctx.process.spawn` takes (03 §3.7): the command, its folder and environment, limits, output, and token. */
export type { SpawnOptions };

/** A job token: the types a process may call through `kv`, the context its calls add, and whether it delegates. */
export type { ProcessToken };

/** How a process ended: what `wait()` returns. */
export type { ProcessResult };

/** The payload of a detached process's `onExit` command. */
export type { ProcessExit };

/** A process spawned by this invocation. */
export interface ProcessHandle {
  /** The process's id, as `kernel.processes.list` and `ctx.process.kill` know it. */
  readonly processId: string;
  /** Resolves once the process has ended; calling it again returns the same result. */
  wait(): Promise<ProcessResult>;
  /** Kills the process group: SIGTERM, then SIGKILL after 3 s; a no-op once it has ended. */
  kill(): Promise<void>;
}

/** `ctx.process` (capability `process`): OS processes in their own process groups, supervised by the kernel. */
export interface Processes {
  /** Starts a process; `detached` ones outlive the invocation and report their end to `onExit`. */
  spawn(options: SpawnOptions): Promise<ProcessHandle>;
  /** Kills a live process this extension owns, spawned by any invocation. */
  kill(processId: string): Promise<void>;
}
