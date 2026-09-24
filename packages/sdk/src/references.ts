import type { Json } from '@kvman/protocol';

type Reference<Name extends string, Kind extends string, Types> = Name & {
  readonly '~kvmanReference': { readonly kind: Kind; readonly types: Types };
};

/** A registered command's name, typed with its input and output. */
export type CommandRef<Name extends string = string, Input = Json, Output = unknown> = Reference<Name, 'command', { input: Input; output: Output }>;

/** A registered query's name, typed with its input and output. */
export type QueryRef<Name extends string = string, Input = Json, Output = unknown> = Reference<Name, 'query', { input: Input; output: Output }>;

/** A registered event's name, typed with its payload. */
export type EventRef<Name extends string = string, Payload = Json> = Reference<Name, 'event', { payload: Payload }>;

/** A registered collection's name, typed with its documents. */
export type CollectionRef<Name extends string = string, Doc extends object = object> = Reference<Name, 'collection', { doc: Doc }>;

/** A registered log's name or family (`history:*`), typed with its entries. */
export type LogRef<Name extends string = string, Entry = Json> = Reference<Name, 'log', { entry: Entry }>;

/** A registered entity's name, typed with its records. */
export type EntityRef<Name extends string = string, Record = Json> = Reference<Name, 'entity', { record: Record }>;

/** A registered error code. */
export type ErrorRef<Code extends string = string> = Reference<Code, 'error', Record<never, never>>;

/** A registered schedule's name. */
export type ScheduleRef<Name extends string = string> = Reference<Name, 'schedule', Record<never, never>>;
