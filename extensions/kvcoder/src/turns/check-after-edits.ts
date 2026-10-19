import type { Ctx } from '@kvman/sdk';
import type { Check } from '../schemas/check.ts';
import type { RunCall } from '../calls/run-tool.ts';
import { runLine } from '../calls/line-run.ts';

// The person's check after file changes (plan 08 §8.3, ADR 0094, 3): after a reply whose `fs` change ran at once and
// succeeded, `kvcoder.check`'s line runs once, without asking, and its exit code and last 4 KB end the last change's result.


const changes: ReadonlySet<string> = new Set(['write', 'edit', 'undo', 'assemble']);
const tailBytes = 4096;

/** The reply's last file change that ran at once and succeeded, by its place. */
export function lastFileChange(calls: readonly (RunCall | undefined)[], succeeded: readonly boolean[]): number | undefined {
  const index = calls.findLastIndex((call, place) => call?.connector === 'fs' && changes.has(call.command) && succeeded[place] === true);
  return index === -1 ? undefined : index;
}

// The end of the output, whole characters, at most 4 KB.
function tail(output: string): string {
  const bytes = Buffer.from(output.trimEnd(), 'utf8');
  return bytes.length <= tailBytes ? bytes.toString('utf8') : `…${bytes.subarray(bytes.length - tailBytes).toString('utf8').replace(/^�+/, '')}`;
}

/** Runs the check and gives the lines the change's result ends with. */
export async function checkLines(ctx: Ctx, sessionId: string, check: NonNullable<Check>): Promise<string> {
  const run = await runLine(ctx, sessionId, check.line, { timeoutMs: check.timeoutMs });
  const timedOut = run.timedOut ? `, timed out after ${String(Math.round(check.timeoutMs / 1000))} s` : '';
  const output = tail(run.output);
  return `\n\n[kvman ran the check: ${check.line}, exit code ${String(run.exitCode ?? 1)}${timedOut}]${output === '' ? '' : `\n${output}`}`;
}
