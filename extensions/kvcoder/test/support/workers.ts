import type { Json } from '@kvman/sdk';

// Worker entries for the setting `kvcoder.delegate.workers` (plan 08 §8.5, ADR 0021, 20).

export type WorkerFields = { description?: string; enabled?: boolean; instructions?: string; connectors?: string[] | null; model?: string | null; thinking?: string | null };

/** A whole worker entry: a turned-on subagent with every connector and the chat's model, unless `fields` say otherwise. */
export function worker(name: string, fields: WorkerFields = {}): Record<string, Json> {
  return { name, description: `The ${name} worker`, enabled: true, kind: 'subagent', instructions: '', connectors: null, model: null, thinking: null, ...fields };
}

/** The setting holding these workers. */
export function workers(...entries: readonly Record<string, Json>[]): Record<string, Json> {
  return { 'kvcoder.delegate.workers': [...entries] };
}
