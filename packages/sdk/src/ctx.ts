import type { z } from 'zod';
import type { Json } from './json.ts';
import type { ProblemError } from './problem.ts';
import type { CommandRegistration, HandlerPoint, HandlerRegistration, QueryRegistration, SettingRegistration, SettingScope } from './registrations.ts';
import type { CommandInputOf, InputOf, OutputOf, SettingValueOf } from './registry.ts';
import type { Caller, File, Workspace } from './rows.ts';
import type { Store } from './store.ts';

/** The job a handler is running (plan 03 §3.3). */
export type CurrentJob = {
  /** The job id (UUIDv7); a sync job has one too, but no row. */
  id: string;
  /** The id of the first job of this sync chain. */
  rootId: string;
  /** The job's workspace. */
  workspace: Workspace;
  /** Who started the job. */
  caller: Caller;
  /** Aborted on cancel, timeout, or shutdown. */
  signal: AbortSignal;
  /** Sends a progress chunk (JSON, at most 64 KiB) to the stream of `rootId`. */
  progress(data: Json): void;
};

/** When a scheduled command runs: once at a date, or on a cron; the same `key` again replaces the schedule. */
export type ScheduleTiming = { at: Date; key?: string } | { cron: string; key?: string };

/** Schedules a command and resolves to the schedule id; `cancel` deletes a schedule. */
export type ScheduleCall = {
  <Name extends string>(name: Name, input: CommandInputOf<Name>, timing: ScheduleTiming): Promise<string>;
  /** Deletes a schedule. */
  cancel(id: string): Promise<void>;
};

/** Files the kernel keeps (plan 02 §2.7). */
export type Files = {
  /** Stores a file in the job's workspace and returns its row. */
  write(name: string, data: Uint8Array | string, type: string): Promise<File>;
  /** The file's row. */
  get(id: string): Promise<File>;
  /** The file's content. */
  read(id: string): Promise<Buffer>;
  /** The file's absolute path, for streaming. */
  path(id: string): Promise<string>;
  /** Deletes a file this extension owns, or a user upload. */
  unlink(id: string): Promise<void>;
};

/** Settings: any key can be read; only the extension's own keys can be written. */
export type SettingsAccess = {
  /** The key's value: workspace, else global, else preset, else default. */
  get<Key extends string>(key: Key): Promise<SettingValueOf<Key>>;
  /** Sets one of this extension's keys in a scope the key allows. */
  set<Key extends string>(key: Key, value: SettingValueOf<Key>, options: { scope: SettingScope }): Promise<void>;
};

/** This extension's secrets, home-wide, kept only in `secrets.json`. */
export type Secrets = {
  /** The secret, or `undefined` when none is set. */
  get(name: string): Promise<string | undefined>;
  /** Sets a secret. */
  set(name: string, value: string): Promise<void>;
  /** Deletes a secret. */
  delete(name: string): Promise<void>;
};

/** A long-lived process started through `ctx.processes`. */
export type ProcessInfo = { name: string; pid: number; startedAt: string };

/** How to start a long-lived process. */
export type ProcessStart = { command: string; args?: readonly string[]; cwd?: string; env?: Readonly<Record<string, string>> };

/** Long-lived child processes, per extension and workspace (plan 02 §2.16). */
export type Processes = {
  /** Starts a process; a running one with the same name fails `PROCESS_RUNNING`. */
  start(name: string, options: ProcessStart): Promise<ProcessInfo>;
  /** Stops a process and its children. */
  stop(name: string): Promise<void>;
  /** This extension's processes in the workspace. */
  list(): Promise<ProcessInfo[]>;
  /** The last lines of a process's output. */
  log(name: string, options?: { tail?: number }): Promise<string>;
};

/** Fields of a log line: never payloads, settings values, or secrets. */
export type LogFields = Readonly<Record<string, Json>>;

/** Writes lines to `logs/kvman.log`, tagged with the extension and, inside a handler, the job id. */
export type Log = {
  /** Writes a debug line. */
  debug(message: string, fields?: LogFields): void;
  /** Writes an info line. */
  info(message: string, fields?: LogFields): void;
  /** Writes a warning line. */
  warn(message: string, fields?: LogFields): void;
  /** Writes an error line. */
  error(message: string, fields?: LogFields): void;
};

/** The whole API an extension sees; its entry receives it once per worker. */
export type Ctx = {
  /** Registers a command; the name starts with the extension's namespace. */
  registerCommand<Input extends z.ZodType, Output extends z.ZodType>(name: string, registration: CommandRegistration<Input, Output>): void;
  /** Registers a query; the name starts with the extension's namespace. */
  registerQuery<Input extends z.ZodType, Output extends z.ZodType>(name: string, registration: QueryRegistration<Input, Output>): void;
  /** Registers a setting key; the key starts with the extension's namespace. */
  registerSetting<Schema extends z.ZodType>(key: string, registration: SettingRegistration<Schema>): void;
  /** Registers a handler for one of the kernel's points. */
  registerHandler<Point extends HandlerPoint>(point: Point, registration: HandlerRegistration<Point>): void;
  /** Runs a command or query now and resolves to its output. */
  exec<Name extends string>(name: Name, input: InputOf<Name>): Promise<OutputOf<Name>>;
  /** Queues a command and resolves to its job id. */
  execAsync<Name extends string>(name: Name, input: CommandInputOf<Name>): Promise<string>;
  /** Schedules a command. */
  schedule: ScheduleCall;
  /** Cancels a job. */
  cancel(jobId: string): Promise<void>;
  /** Makes a ProblemError to throw; `code` is `<namespace>/UPPER_SNAKE`, and it is never retried. */
  problem(code: string, params?: Readonly<Record<string, Json>>): ProblemError;
  /** The current job; outside a handler it fails `NO_JOB`. */
  readonly job: CurrentJob;
  /** The extension's store. */
  store: Store;
  /** Files the kernel keeps. */
  files: Files;
  /** Settings. */
  settings: SettingsAccess;
  /** The extension's secrets. */
  secrets: Secrets;
  /** Long-lived child processes. */
  processes: Processes;
  /** Logging. */
  log: Log;
};
