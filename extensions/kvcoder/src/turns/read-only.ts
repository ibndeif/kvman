import type { ConnectorCommand } from '../connectors/connector-command.ts';

// What a read-only worker's helper may run (ADR 0056, 3): reads, questions, its report as an artifact, and help.
// Anything that could change something is refused, and so is every command kvcoder doesn't know the effect of.

const changing = new Set(['kvcoder.fs.part', 'kvcoder.background.stop', 'kvcoder.delegate.check']);

/** Whether a read-only helper may run the command: `builtin` is its built-in entry, or `undefined` for a registered command or a binary. */
export function readOnlyAllows(command: string, builtin: ConnectorCommand | undefined): boolean {
  if (command === 'help') return true;
  return builtin !== undefined && !builtin.asks && !changing.has(builtin.registration);
}

/** What the model reads when a read-only helper's call is refused. */
export const readOnlyRefusal = (connector: string, command: string): string => `This helper is read-only: ${connector} ${command} could change something, so it isn't run. Report what you found instead.`;
