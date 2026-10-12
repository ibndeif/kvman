import { z, type Ctx } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import type { RunStaging } from '../schemas/records.ts';
import { findSession, userOnly } from '../sessions/session-lookup.ts';
import { records } from '../store/collections.ts';
import { restoreStaging, stagedPathsBetween, stagingMark, type StagingMark } from './git-staging.ts';

// The guard on the Git staging area around a program worker's run (plan 08 §8.5; ADR 0060, 4): what the run changed
// is kept on its record and told to the model, and the person may put what was staged back while nothing has been
// staged or committed since.

/** What a run changed, from the mark made before it; `undefined` when there was no mark or nothing changed. */
export async function stagingChange(folder: string, before: StagingMark | undefined, signal: AbortSignal): Promise<RunStaging | undefined> {
  if (before === undefined) return undefined;
  const after = await stagingMark(folder, signal);
  if (after === undefined || (after.tree === before.tree && after.head === before.head)) return undefined;
  const paths = after.tree === before.tree ? 0 : await stagedPathsBetween(folder, before.tree, after.tree, signal);
  return { tree: before.tree, after: after.tree, head: after.head, headMoved: after.head !== before.head, paths, restored: false };
}

const shown = (commit: string | null): string => (commit === null ? 'no commit' : commit.slice(0, 12));

/** The lines a changed run's result ends with, for the model. */
export function stagingLines(change: RunStaging, before: StagingMark): string {
  const staged = change.tree === change.after ? [] : [`kvman: this run changed what is staged in Git (${change.paths} paths differ from before it ran).`];
  const moved = change.headMoved ? [`kvman: this run moved HEAD from ${shown(before.head)} to ${shown(change.head)}.`] : [];
  return [...staged, ...moved].join('\n');
}

export function registerStagingRestore(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.delegate.staging.restore', {
    description: "Puts back what was staged in Git before a program worker's run; it changes no file and no commit.",
    input: z.strictObject({ sessionId: z.string(), runId: z.string() }),
    output: z.object({}),
    public: true,
    retries: 0,
    handle: async ({ sessionId, runId }) => {
      userOnly(ctx, 'kvcoder.delegate.staging.restore');
      await findSession(ctx, sessionId);
      const store = records(ctx.store);
      const run = await store.runs.get(runId);
      if (run === undefined || run.sessionId !== sessionId) throw ctx.problem('kvcoder/JOB_NOT_FOUND', { sessionId, id: runId });
      const kept = run.staging;
      if (kept === null || kept.restored) throw invalid('This run has no staging change to restore.');
      if (kept.headMoved) throw invalid('This run moved HEAD, so its staging change cannot be restored here.');
      const folder = ctx.job.workspace.path;
      const current = await stagingMark(folder, ctx.job.signal);
      if (current === undefined || current.tree !== kept.after || current.head !== kept.head) throw invalid('The staging area or HEAD has changed since the run.');
      await restoreStaging(folder, kept.tree, ctx.job.signal);
      await store.runs.update(runId, { staging: { ...kept, restored: true } });
      return {};
    },
  });
}
