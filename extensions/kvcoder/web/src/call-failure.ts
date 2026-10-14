// Why a call failed, as its closed card says it to the person (ADR 0079): the agent's own request that wasn't valid,
// a call the person denied, a line that failed, or a connector's error in its first line.

const reasonLimit = 160;

export type CallFailure =
  | { kind: 'invalid' }
  | { kind: 'denied' }
  | { kind: 'command' }
  | { kind: 'error'; message: string };

const errorLine = /^error ([A-Za-z0-9_/-]+): ?(.*)/;

function firstLine(text: string): string {
  const line = (text.split('\n', 1)[0] ?? '').trim();
  return line.length > reasonLimit ? `${line.slice(0, reasonLimit)}…` : line;
}

/** How a failed call's output reads to the person. */
export function callFailure(output: string): CallFailure {
  if (output.startsWith('denied by the user')) return { kind: 'denied' };
  const error = errorLine.exec(output);
  if (error?.[1] === 'VALIDATION_FAILED') return { kind: 'invalid' };
  if (error !== null) return { kind: 'error', message: firstLine(error[2] ?? '') };
  return /\[exit code \d+\]\s*$/.test(output) ? { kind: 'command' } : { kind: 'error', message: firstLine(output) };
}
