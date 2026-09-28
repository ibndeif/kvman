import type { Text, plainCapabilityNameSchema } from '@kvman/protocol';
import type { input as Input, output as Output, ZodType } from 'zod';
import type {
  CollectionDef, CommandDef, ConfigDef, DataVersionDef, EntityDef, ErrorDef, EventDef, LogDef, ModelDef, ProviderDef, QueryDef, ScheduleDef, SubscriptionDef,
} from './definitions.ts';
import type { CollectionRef, CommandRef, EntityRef, ErrorRef, EventRef, LogRef, QueryRef, ScheduleRef } from './references.ts';

/** A capability requested without type patterns. */
export type PlainCapabilityName = Output<typeof plainCapabilityNameSchema>;

/** The registration API `setup` receives; closed when `setup` returns. */
export interface Ext {
  /** Requests `calls` for the given type patterns. */
  requestCapability(name: 'calls', options: { reason: Text; types: string[] }): void;
  /** Requests a capability the person must grant. */
  requestCapability(name: PlainCapabilityName, options: { reason: Text }): void;
  /** Requests a lower isolation than `sandboxed`. */
  requestIsolation(mode: 'shared' | 'dedicated', options: { reason: Text }): void;
  /** Message types that enabled extensions must provide. */
  requireTypes(types: string[], options: { reason: Text }): void;
  /** Public components of other extensions that its views use. */
  requireComponents(names: string[], options: { reason: Text }): void;
  /** Registers a command under its full name. */
  registerCommand<Name extends string, InputSchema extends ZodType, OutputSchema extends ZodType = ZodType>(
    name: Name,
    definition: CommandDef<InputSchema, OutputSchema>,
  ): CommandRef<Name, Input<InputSchema>, Output<OutputSchema>>;
  /** Registers a query under its full name. */
  registerQuery<Name extends string, InputSchema extends ZodType, OutputSchema extends ZodType>(
    name: Name,
    definition: QueryDef<InputSchema, OutputSchema>,
  ): QueryRef<Name, Input<InputSchema>, Output<OutputSchema>>;
  /** Registers an event under its full name. */
  registerEvent<Name extends string, PayloadSchema extends ZodType = ZodType>(
    name: Name,
    definition: EventDef<PayloadSchema>,
  ): EventRef<Name, Output<PayloadSchema>>;
  /** Subscribes to a registered event, typed by its reference. */
  subscribe<Payload>(event: EventRef<string, Payload>, definition: SubscriptionDef<Payload>): void;
  /** Subscribes to an event type or a `<prefix>.*` pattern. */
  subscribe(event: string, definition: SubscriptionDef): void;
  /** Registers a timer that sends one of its own commands. */
  registerSchedule<Name extends string>(name: Name, definition: ScheduleDef): ScheduleRef<Name>;
  /** Registers an error code `<namespace>/UPPER_SNAKE`. */
  registerError<Code extends string>(code: Code, definition: ErrorDef): ErrorRef<Code>;
  /** Sets the data version (1 when never called) and its migrations. */
  registerDataVersion(version: number, definition?: DataVersionDef): void;
  /** Registers a document collection. */
  registerCollection<Name extends string, Schema extends ZodType<object>>(
    name: Name,
    definition: CollectionDef<Schema>,
  ): CollectionRef<Name, Output<Schema>>;
  /** Registers a log, or a log family when the name ends in `:*`. */
  registerLog<Name extends string, EntrySchema extends ZodType>(name: Name, definition: LogDef<EntrySchema>): LogRef<Name, Output<EntrySchema>>;
  /** Registers an entity under its full name. */
  registerEntity<Name extends string, Schema extends ZodType>(name: Name, definition: EntityDef<Schema>): EntityRef<Name, Output<Schema>>;
  /** Registers the extension's settings. */
  registerConfig(definition: ConfigDef): void;
  /** Registers an LLM provider under its id. */
  registerProvider(id: string, definition: ProviderDef): void;
  /** Registers a static model under its id. */
  registerModel(id: string, definition: ModelDef): void;
}
