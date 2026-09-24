import type { Json, JsonObject } from '@kvman/protocol';
import type { Store } from './store.ts';

/** Options of `ctx.step`. */
export type StepOptions = { retrySafe?: boolean };

/** What a handler acts through; it grows with each milestone that builds a member of `05` §5.4. */
export interface Ctx {
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
