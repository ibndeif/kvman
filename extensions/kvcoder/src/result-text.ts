// What a call returns to the model, and how long output is cut (plan 08 §8.3, ADR 0009, 93).

/** Output over this many bytes is cut. */
export const outputLimit = 30 * 1024;
/** The bytes kept at each end of cut output. */
export const outputKept = 15 * 1024;

// Terminal codes a command prints for a person's screen (ADR 0051, 1): OSC sequences up to their end mark, CSI
// sequences such as colours and cursor moves, and the two-character escapes.
const terminalCodes = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-?]*[ -/]*[@-~]|\u001b[()][0-9A-B]|\u001b[@-Z\\^_=>]/g;

/** Output without terminal colour and cursor codes. */
export const plainText = (text: string): string => text.replace(terminalCodes, '');

/** What a command's environment adds so tools print plain output, unless the environment already chose. */
export function plainEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  return environment['NO_COLOR'] === undefined && environment['FORCE_COLOR'] === undefined ? { NO_COLOR: '1' } : {};
}

/** The first and last bytes of cut output around the marker. */
export function cutOutput(head: Buffer, omitted: number, tail: Buffer): string {
  return `${head.toString('utf8')}\n[… ${omitted} bytes omitted …]\n${tail.toString('utf8')}`;
}

/** Cuts text over 30 KB to its first and last 15 KB around an explicit marker. */
export function truncate(text: string): string {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= outputLimit) return text;
  return cutOutput(bytes.subarray(0, outputKept), bytes.length - 2 * outputKept, bytes.subarray(bytes.length - outputKept));
}

/** The text a line in the shell returns to the model: the output (already cut, trailing newlines dropped), then any notes, then its exit code (ADR 0009, 93). */
export function resultLines(output: string, exitCode: number, notes: readonly string[] = []): string {
  return [output.replace(/[\r\n]+$/, ''), ...notes, `[exit code ${exitCode}]`].filter((part) => part !== '').join('\n');
}
