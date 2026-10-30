import path from 'node:path';
import type { RunCall } from '../calls/run-tool.ts';
import { resolveInWorkspace } from '../files/workspace-path.ts';
import type { SessionDoc } from '../schemas/records.ts';

// What a helper's run may change (plan 08 §8.5, ADR 0108, 2): a `check` run changes no file through `fs`, and a
// `change` run only the files its brief names. A `find` or `review` run is read-only, refused elsewhere.

const changingCommands: ReadonlySet<string> = new Set(['write', 'edit', 'undo', 'part', 'assemble']);

/** Whether an `fs` command changes a file. */
export const changesFiles = (command: string): boolean => changingCommands.has(command);

const shown = (workspace: string, file: string): string => path.relative(workspace, file).split(path.sep).join('/');

/** Why the run refuses this call before anyone is asked, or `undefined` when it may run. */
export async function runScopeRefusal(workspace: string, session: Pick<SessionDoc, 'run'>, call: RunCall): Promise<string | undefined> {
  const run = session.run;
  if (run === null || call.connector !== 'fs' || !changingCommands.has(call.command)) return undefined;
  if (run.kind === 'check') return 'A check run changes no file: report in your answer what should change and why.';
  if (run.kind !== 'change' || run.files === null) return undefined;
  const requested = call.payload['path'];
  if (typeof requested !== 'string') return undefined;
  const target = await resolveInWorkspace(workspace, requested);
  return run.files.includes(target) ? undefined : `This run may change only: ${run.files.map((file) => shown(workspace, file)).join(', ')}.`;
}
