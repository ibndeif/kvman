import type { Json, JsonObject, LiveChunk, Message, OnReply, Priority, Problem } from '@kvman/protocol';
import type { CommandRef, EventRef, QueryRef } from './references.ts';
import type { Store } from './store.ts';

/** Options of `ctx.step`. */
export type StepOptions = { retrySafe?: boolean };

/** Options of `ctx.send`: a command started without waiting, in the unit of work. */
export type SendOptions = {
  lane?: string;
  delayMs?: number;
  at?: number;
  priority?: Priority;
  deadlineAt?: number;
  onReply?: OnReply;
  context?: Record<string, string>;
  idempotencyKey?: string;
};

/** Options of `ctx.command`: send's options without a continuation or a timer. */
export type CommandOptions = Pick<SendOptions, 'lane' | 'priority' | 'deadlineAt' | 'context' | 'idempotencyKey'>;

/** Options of `ctx.defer`. */
export type DeferOptions = { onAbort?: string };

/** What `ctx.defer` returns; a command handler returns it to reply later with `ctx.reply`. */
export interface Deferred {
  /** Marks the handler's result as deferred. */
  readonly deferred: true;
}

/** A problem a handler throws, or that `ctx.command` and `ctx.query` reject with. */
export interface ProblemError extends Error {
  /** The problem as callers receive it. */
  readonly problem: Problem;
}

/** Options of `ctx.problem`. */
export type ProblemOptions = { params?: Record<string, Json>; detail?: string };

/** Structured log lines, redacted and attributed to the current message. */
export interface Logger {
  /** Logs at debug level. */
  debug(message: string, fields?: JsonObject): void;
  /** Logs at info level. */
  info(message: string, fields?: JsonObject): void;
  /** Logs at warn level. */
  warn(message: string, fields?: JsonObject): void;
  /** Logs at error level. */
  error(message: string, fields?: JsonObject): void;
}

/** The workspace an invocation runs in. */
export type Workspace = { id: string; path: string; name: string };

type TypesOf<Ref> = Ref extends { readonly '~kvmanReference': { readonly types: infer Types } } ? Types : never;
/** The input type of a command or query reference. */
export type InputOf<Ref> = TypesOf<Ref> extends { input: infer Input } ? Input : never;
/** The output type of a command or query reference. */
export type OutputOf<Ref> = TypesOf<Ref> extends { output: infer Output } ? Output : never;
/** The payload type of an event reference. */
export type PayloadOf<Ref> = TypesOf<Ref> extends { payload: infer Payload } ? Payload : never;

/** What a handler acts through; it grows with each milestone that builds a member of `05` §5.4. */
export interface Ctx {
  /** The message being handled. */
  readonly message: Message;
  /** The context inherited along the chain, such as `locale` or a `sessionId`. */
  readonly context: Readonly<Record<string, string>>;
  /** The invocation's workspace; absent for global-scope handlers. */
  readonly workspace?: Workspace;
  /** Ids that repeat when the message is redelivered. */
  readonly ids: {
    /** A new ULID; the n-th call returns the same id on every attempt. */
    'new'(): string;
  };
  /** The time in epoch milliseconds; the n-th call returns the same time on every attempt. */
  now(): number;
  /** Runs a registered command and waits for its result, typed by its reference. */
  command<Ref extends CommandRef>(type: Ref, payload: InputOf<Ref>, options?: CommandOptions): Promise<OutputOf<Ref>>;
  /** Runs a command and waits for its result; rejects with a ProblemError when it fails. */
  command<Result = Json>(type: string, payload: Json, options?: CommandOptions): Promise<Result>;
  /** Starts a command without waiting, when the handler commits, typed by its reference. */
  send<Ref extends CommandRef>(type: Ref, payload: InputOf<Ref>, options?: SendOptions): void;
  /** Starts a command without waiting, when the handler commits. */
  send(type: string, payload: Json, options?: SendOptions): void;
  /** Runs a registered query and returns its data, typed by its reference. */
  query<Ref extends QueryRef>(type: Ref, payload: InputOf<Ref>): Promise<OutputOf<Ref>>;
  /** Runs a query and returns its data; rejects with a ProblemError when it fails. */
  query<Result = Json>(type: string, payload: Json): Promise<Result>;
  /** Publishes one of its own durable or transient events when the handler commits, typed by its reference. */
  publish<Ref extends EventRef>(type: Ref, payload: PayloadOf<Ref>): void;
  /** Publishes one of its own durable or transient events when the handler commits. */
  publish(type: string, payload: Json): void;
  /** Streams a chunk of one of its own live events to `<type>:<key>` at once. */
  live(type: string, key: string, chunk: LiveChunk): void;
  /** Defers a command's reply; the handler returns the result, and a later handler calls `ctx.reply`. */
  defer(options?: DeferOptions): Deferred;
  /** Completes one of its own deferred commands with a value or a problem when the handler commits. */
  reply(commandId: string, result: Json | ProblemError): void;
  /** A problem with one of the extension's registered error codes, to throw. */
  problem(code: string, options?: ProblemOptions): ProblemError;
  /** Structured log lines attributed to this message. */
  readonly log: Logger;
  /** The extension's storage in the invocation's workspace; read-only in queries. */
  readonly store: Store;
  /** Runs an external effect once per message and records its result; a redelivery returns the recorded result. */
  step<Result extends Json | undefined>(name: string, effect: () => Promise<Result>, options?: StepOptions): Promise<Result>;
}

/** Where a stored config value lives. */
export type ConfigScope = 'global' | 'workspace';

/** What a data migration step acts through. */
export interface MigrationContext {
  /** The extension's stored config. */
  readonly config: {
    /** The stored value in `scope` (of `workspaceId` for `workspace`), or `undefined`. */
    get(scope: ConfigScope, workspaceId?: string): Promise<JsonObject | undefined>;
    /** Replaces the stored value when the step commits. */
    set(scope: ConfigScope, value: JsonObject, workspaceId?: string): void;
  };
}
