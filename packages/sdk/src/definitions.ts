import type {
  Access, EventDelivery, Json, Priority, Text, agentToolSchema, commandAgentToolSchema, configScopeSchema, slashSchema,
} from '@kvman/protocol';
import type { output as Output, input as Input, ZodType } from 'zod';
import type { Ctx, Deferred } from './context.ts';
import type { MigrationContext } from './migration.ts';

/** A composer slash command of a command. */
export type SlashDef = Output<typeof slashSchema>;

/** A query exposed to the agent as a read-only tool. */
export type AgentToolDef = Output<typeof agentToolSchema>;

/** A command exposed to the agent as a tool. */
export type CommandAgentToolDef = Output<typeof commandAgentToolSchema>;

/** A command: one handler that does something and returns its result. */
export interface CommandDef<InputSchema extends ZodType = ZodType, OutputSchema extends ZodType = ZodType> {
  description: string;
  input: InputSchema;
  output?: OutputSchema;
  examples?: Json[];
  lane?: string;
  concurrency?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  priority?: Priority;
  retention?: string;
  namingException?: string;
  scope?: 'workspace' | 'global';
  access?: Access;
  slash?: SlashDef;
  agentTool?: CommandAgentToolDef;
  handle(input: Output<InputSchema>, ctx: Ctx): Promise<Input<OutputSchema> | Deferred>;
}

/** A query: one read-only handler, never queued. */
export interface QueryDef<InputSchema extends ZodType = ZodType, OutputSchema extends ZodType = ZodType> {
  description: string;
  input: InputSchema;
  output: OutputSchema;
  examples?: Json[];
  timeoutMs?: number;
  namingException?: string;
  access?: Access;
  agentTool?: AgentToolDef;
  handle(input: Output<InputSchema>, ctx: Ctx): Promise<Input<OutputSchema>>;
}

/** An event this extension publishes, with its delivery class. */
export interface EventDef<PayloadSchema extends ZodType = ZodType> {
  description: string;
  delivery?: EventDelivery;
  payload?: PayloadSchema;
  chunk?: 'text' | 'value' | 'data';
  namingException?: string;
}

/** A handler for a durable or transient event. */
export interface SubscriptionDef<Payload = Json> {
  description: string;
  lane?: string;
  concurrency?: number;
  timeoutMs?: number;
  handle(payload: Payload, ctx: Ctx): Promise<void>;
}

/** A timer that sends one of the extension's own commands. */
export interface ScheduleDef {
  description: string;
  every?: string;
  cron?: string;
  command: string;
  payload?: Json;
}

/** An error the extension's handlers throw with `ctx.problem`. */
export interface ErrorDef {
  description: string;
  title: string;
  retryable?: boolean;
  hint?: string;
}

/** One data migration step, run when the stored data version is `to - 1`. */
export interface MigrationDef {
  to: number;
  up(m: MigrationContext): Promise<void>;
}

/** The data version's migrations and the newer data versions its code can still run on. */
export interface DataVersionDef {
  migrations?: MigrationDef[];
  compatibleWith?: number[];
}

/** A document collection. */
export interface CollectionDef<Schema extends ZodType = ZodType> {
  description: string;
  schema: Schema;
  idField?: string;
  indexes?: string[][];
}

/** An append-only log, or a family of logs when its name ends in `:*`. */
export interface LogDef<EntrySchema extends ZodType = ZodType> {
  description: string;
  entry: EntrySchema;
}

/** A typed record the UI can show and attach actions to. */
export interface EntityDef<Schema extends ZodType = ZodType> {
  description: string;
  title: Text;
  schema: Schema;
  idField?: string;
  display: { title: Text; subtitle?: Text; icon?: string };
  route?: string;
}

/** The extension's settings. */
export interface ConfigDef<Schema extends ZodType = ZodType> {
  scope: Output<typeof configScopeSchema>;
  schema: Schema;
}
