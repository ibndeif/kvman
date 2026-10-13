import type { ConnectorCommand } from '../connectors/connector-command.ts';

// What no helper runs (ADR 0063, 1): an artifact is for the person, and only the lead of a chat shows them one. A
// helper returns what it made in its answer.

const leadOnly = new Set(['kvcoder.artifact.write', 'kvcoder.artifact.edit']);

/** Whether a helper may run the command: `builtin` is its built-in entry, or `undefined` for a registered command or a binary. */
export const helperAllows = (builtin: ConnectorCommand | undefined): boolean => builtin === undefined || !leadOnly.has(builtin.registration);

/** What the model reads when a helper's artifact call is refused. */
export const helperRefusal = 'A helper writes no artifact: return it in your answer, and the lead agent shows the person what is worth showing.';
