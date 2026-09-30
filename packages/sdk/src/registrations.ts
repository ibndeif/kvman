import type { z } from 'zod';
import type { Problem } from './problem.ts';
import type { Caller } from './rows.ts';

/** What a command or query registration shares. */
type JobRegistration<Input extends z.ZodType, Output extends z.ZodType> = {
  /** One sentence saying what it does. */
  description: string;
  /** The zod schema its input is checked against before it runs. */
  input: Input;
  /** The zod schema its output is checked against after it runs. */
  output: Output;
  /** The handler. */
  handle: (input: z.output<Input>) => z.input<Output> | Promise<z.input<Output>>;
  /** Whether other extensions and HTTP clients may call it (default `false`). */
  public?: boolean;
  /** How long an attempt may run (default 600 000). */
  timeoutMs?: number;
  /** The largest input in bytes of JSON (default 1 MiB, at most 32 MiB). */
  maxInputBytes?: number;
  /** The largest output in bytes of JSON (default 1 MiB, at most 32 MiB). */
  maxOutputBytes?: number;
};

/** A command: a job that may write. */
export type CommandRegistration<Input extends z.ZodType, Output extends z.ZodType> = JobRegistration<Input, Output> & {
  /** How many times a failed async attempt is retried (default 3). */
  retries?: number;
  /** Whether it runs only as a sync call, so its input never lands in a job row (default `false`); required for a command that takes a secret. */
  syncOnly?: boolean;
};

/** A query: a job that only reads. */
export type QueryRegistration<Input extends z.ZodType, Output extends z.ZodType> = JobRegistration<Input, Output>;

/** Where a setting can be set: the user's whole home, or one workspace. */
export type SettingScope = 'global' | 'workspace';

/** The scopes a setting allows: both (the default), global only, or none (preset-only). */
export type SettingScopes = readonly ['global', 'workspace'] | readonly ['global'] | readonly [];

/** A setting key. */
export type SettingRegistration<Schema extends z.ZodType> = {
  /** One sentence saying what it sets. */
  description: string;
  /** The zod schema its values are checked against. */
  schema: Schema;
  /** The value when nothing sets it; without one, the preset must set the key. */
  default?: z.input<Schema>;
  /** Where it can be set (default `['global', 'workspace']`). */
  scopes?: SettingScopes;
};

/** The input the three job points share. */
export type JobPointInput = { jobId: string; rootId: string; name: string; caller: Caller; workspaceId: string };

/** The kernel's handler points, each with its handler's input (plan 02 §2.15). */
export type HandlerPoints = {
  'kernel.job.failed': JobPointInput & { problem: Problem; attempts: number };
  'kernel.job.succeeded': JobPointInput;
  'kernel.job.cancelled': JobPointInput & { reason: string };
  'kernel.process.exited': { extension: string; workspaceId: string; name: string; exitCode: number | null; signal: string | null };
  'kernel.workspace.opened': { workspaceId: string };
  'kernel.started': Record<string, never>;
  'kernel.stopping': Record<string, never>;
};

/** The name of a kernel handler point. */
export type HandlerPoint = keyof HandlerPoints;

/** A handler for one of the kernel's points; it runs as an async job. */
export type HandlerRegistration<Point extends HandlerPoint> = {
  /** One sentence saying what it does. */
  description: string;
  /** The handler. */
  handle: (input: HandlerPoints[Point]) => void | Promise<void>;
  /** How many times a failed attempt is retried (default 3). */
  retries?: number;
  /** How long an attempt may run (default 600 000). */
  timeoutMs?: number;
};
