// What a call shows the person (plan 08 §8.7, ADR 0011, 13): the description the model wrote, the connector and its
// command, and the payload, which for a line in the shell is the line itself. A call stored before the `run` tool has
// only its command line and the words it came with.

const lineLimit = 200;

export type CallView = {
  /** What the call does, for the person. */
  description?: string;
  /** `connector · command`. */
  label?: string;
  /** The line a shell or binary call runs, or an old call's command. */
  line?: string;
  /** Any other call's payload, as indented JSON. */
  payload?: string;
  /** Whether the call asked to keep running in the background. */
  background?: boolean;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);

// The line of `shell exec`, or of a binary's `exec`: the program, then its arguments.
function execLine(connector: string, payload: Record<string, unknown>): string {
  const args = text(payload['args']);
  return text(payload['line']) ?? (args === undefined ? connector : `${connector} ${args}`);
}

function oldView(args: Record<string, unknown>): CallView {
  const description = text(args['title']) ?? text(args['description']);
  const line = text(args['command']);
  return { ...(description === undefined ? {} : { description }), ...(line === undefined ? {} : { line }), ...(args['mode'] === 'async' ? { background: true } : {}) };
}

/** A call's arguments as the person reads them; `given` may still be growing while the model writes the call. */
export function callView(given: Record<string, unknown>): CallView {
  const connector = text(given['connector']);
  const command = text(given['command']);
  if (connector === undefined) return oldView(given);
  const description = text(given['description']);
  const payload = record(typeof given['payload'] === 'string' ? undefined : given['payload']) ?? {};
  const shown = command === 'exec' ? { line: execLine(connector, payload) } : Object.keys(payload).length === 0 ? {} : { payload: JSON.stringify(payload, null, 2) };
  return { ...(description === undefined ? {} : { description }), ...(command === undefined ? {} : { label: `${connector} · ${command}` }), ...shown, ...(payload['background'] === true ? { background: true } : {}) };
}

/** A line or a payload cut to what a card's row shows (ADR 0009, 195). */
export function shortLine(line: string): string {
  const oneLine = line.replace(/\s+/g, ' ');
  return oneLine.length > lineLimit ? `${oneLine.slice(0, lineLimit)}…` : oneLine;
}
