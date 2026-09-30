/**
 * Public commands by name, each `{ input; output }`. An extension augments it for its public commands, so callers get
 * typed `ctx.exec` calls after `import type {} from '<that extension>'`.
 */
export interface Commands {}

/** Public queries by name, each `{ input; output }`, augmented like `Commands`. */
export interface Queries {}

/** Setting values by key, augmented like `Commands`, so `ctx.settings.get` is typed. */
export interface Settings {}

type Entry<Map, Name extends string, Field extends 'input' | 'output'> = Name extends keyof Map
  ? Map[Name] extends Record<Field, infer Value>
    ? Value
    : unknown
  : unknown;

/** The input of a command or query: its declared type, or `unknown` for an undeclared name. */
export type InputOf<Name extends string> = Name extends keyof Commands ? Entry<Commands, Name, 'input'> : Entry<Queries, Name, 'input'>;

/** The output of a command or query: its declared type, or `unknown` for an undeclared name. */
export type OutputOf<Name extends string> = Name extends keyof Commands ? Entry<Commands, Name, 'output'> : Entry<Queries, Name, 'output'>;

/** The input of a command: its declared type, or `unknown` for an undeclared name. */
export type CommandInputOf<Name extends string> = Entry<Commands, Name, 'input'>;

/** The value of a setting: its declared type, or `unknown` for an undeclared key. */
export type SettingValueOf<Key extends string> = Key extends keyof Settings ? Settings[Key] : unknown;
