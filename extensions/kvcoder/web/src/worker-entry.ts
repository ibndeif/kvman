import { thinkingLevels, type Thinking } from './model-groups.ts';

// A worker as kvcoder's configuration edits it (plan 08 §8.5 and §8.7, ADR 0021, 7 and 20): an entry of
// `kvcoder.delegate.workers`, and the form's draft of one.

export type WorkerEntry = { name: string; description: string; enabled: boolean; kind: 'subagent'; instructions: string; connectors: string[] | null; model: string | null; thinking: Thinking | null };

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isThinking = (value: unknown): value is Thinking => thinkingLevels.some((level) => level === value);

function isEntry(value: unknown): value is WorkerEntry {
  if (typeof value !== 'object' || value === null) return false;
  if (!('name' in value) || !('description' in value) || !('enabled' in value) || !('kind' in value) || !('instructions' in value) || !('connectors' in value) || !('model' in value) || !('thinking' in value)) return false;
  if (typeof value.name !== 'string' || typeof value.description !== 'string' || typeof value.enabled !== 'boolean' || value.kind !== 'subagent' || typeof value.instructions !== 'string') return false;
  return (value.connectors === null || strings(value.connectors)) && (value.model === null || typeof value.model === 'string') && (value.thinking === null || isThinking(value.thinking));
}

/** The workers of the setting's value. */
export const workerEntries = (value: unknown): WorkerEntry[] => (Array.isArray(value) ? value.filter(isEntry) : []);

/** The form's draft: `all` stands for every connector, and an empty `thinking` for the chat's own. */
export type WorkerDraft = { name: string; description: string; enabled: boolean; instructions: string; all: boolean; connectors: string[]; model: string | null; thinking: Thinking | '' };

/** The form's draft of a worker, or an empty one for a new worker. */
export function draftOf(entry: WorkerEntry | undefined): WorkerDraft {
  if (entry === undefined) return { name: '', description: '', enabled: true, instructions: '', all: true, connectors: [], model: null, thinking: '' };
  return { name: entry.name, description: entry.description, enabled: entry.enabled, instructions: entry.instructions, all: entry.connectors === null, connectors: [...(entry.connectors ?? [])], model: entry.model, thinking: entry.thinking ?? '' };
}

/** The entry a draft stands for; its connectors keep the order of `offered`. */
export function entryOf(draft: WorkerDraft, offered: readonly string[]): WorkerEntry {
  const connectors = draft.all ? null : [...offered.filter((name) => draft.connectors.includes(name)), ...draft.connectors.filter((name) => !offered.includes(name))];
  return { name: draft.name.trim(), description: draft.description.trim(), enabled: draft.enabled, kind: 'subagent', instructions: draft.instructions, connectors, model: draft.model, thinking: draft.thinking === '' ? null : draft.thinking };
}

// The server's own rules (`src/delegate/workers.ts`), so a mistake shows under its field before anything is written.
const namePattern = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const instructionsLimit = 16 * 1024;

export type DraftField = 'name' | 'description' | 'instructions' | 'connectors';

/** What is wrong with a draft, as a translation key per field; `taken` are the other workers' names. */
export function draftProblems(draft: WorkerDraft, taken: readonly string[]): Partial<Record<DraftField, string>> {
  const name = draft.name.trim();
  const problems: Partial<Record<DraftField, string>> = {};
  if (name === '') problems.name = 'kvcoder.config.workers.invalid.nameEmpty';
  else if (!namePattern.test(name)) problems.name = 'kvcoder.config.workers.invalid.nameShape';
  else if (taken.includes(name)) problems.name = 'kvcoder.config.workers.invalid.nameTaken';
  if (draft.description.trim() === '') problems.description = 'kvcoder.config.workers.invalid.descriptionEmpty';
  if (new TextEncoder().encode(draft.instructions).length > instructionsLimit) problems.instructions = 'kvcoder.config.workers.invalid.instructionsLong';
  if (!draft.all && draft.connectors.length === 0) problems.connectors = 'kvcoder.config.workers.invalid.connectorsEmpty';
  return problems;
}
