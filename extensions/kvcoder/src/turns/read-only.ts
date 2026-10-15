import type { ConnectorCommand } from '../connectors/connector-command.ts';

// What a read-only worker's helper may run (ADR 0056, 3): reads and help; it reports in its answer (ADR 0063).
// Anything that could change something is refused, and so is every command kvcoder doesn't know the effect of. A
// registered command whose target is a query only reads, since the kernel stops a query from writing (ADR 0082, 3).

const changing = new Set(['kvcoder.fs.part', 'kvcoder.background.stop', 'kvcoder.delegate.check']);

/** A registered connector command, as far as a read-only helper cares: whether it runs a query, and whether it asks. */
export type RegisteredCommand = { query?: boolean | undefined; asks?: boolean | undefined };

/** Whether a read-only helper may run the command: `builtin` is its built-in entry, else `registered` is the registered command's, and neither is a binary's. */
export function readOnlyAllows(command: string, builtin: ConnectorCommand | undefined, registered?: RegisteredCommand): boolean {
  if (command === 'help') return true;
  if (builtin !== undefined) return !builtin.asks && !changing.has(builtin.registration);
  return registered?.query === true && registered.asks !== true;
}

/** What the model reads when a read-only helper's call is refused. */
export const readOnlyRefusal = (connector: string, command: string): string => `This helper is read-only: ${connector} ${command} could change something, so it isn't run. Report what you found instead.`;
