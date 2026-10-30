import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { readLines } from '../files/read-file.ts';
import { readText } from '../files/read-text.ts';
import { resolveInWorkspace } from '../files/workspace-path.ts';
import { runKinds, type RunBrief } from '../schemas/delegate-brief.ts';

// A delegated run is one deliverable (plan 08 §8.5, ADR 0108, 2): its kind, one goal, one condition that says it is
// done, the files a `change` run may change, the line ranges whose text kvcoder attaches, and a step budget. kvcoder
// writes the helper's first message from them.

/** The most steps one turn of a helper takes, and its default. */
export const budgetLimit = 60;
/** The text of the attached ranges, in all. */
export const contextLimit = 20 * 1024;

const sentence = z.string().min(1).max(300);
const noWildcards = (value: string): boolean => !/[*?[\]{}]/.test(value);
const range = z.strictObject({
  path: z.string().min(1).describe('A file in the workspace folder.'),
  fromLine: z.number().int().min(1).describe('The first line, 1 by default.').exactOptional(),
  lines: z.number().int().min(1).describe('How many lines, to the end of the file by default.').exactOptional(),
});

export const delegateRunSchema = z
  .strictObject({
    worker: z.string().min(1).describe('The worker to hand the task to, by a name the system prompt lists.'),
    title: z.string().min(1).max(200).describe("The role this run plays, in a few words, such as UI expert or Node.js expert: the person sees it as the helper's name. Keep it under 60 characters; a longer one is shortened."),
    kind: z.enum(runKinds).describe('find: locate or explain code or facts; change: make one change in the files listed; check: run commands or tests and diagnose them; review: review a finished change. find and review only read; check also runs lines but changes no file.'),
    goal: sentence.describe('One sentence of what the run delivers.'),
    done: sentence.describe('One condition anyone can check that says the run is done.'),
    files: z.array(z.string().min(1).refine(noWildcards, 'Name each file; no wildcards.')).min(1).max(50).describe('For change only: the files, in the workspace folder, the run may change or create. Required for change.').exactOptional(),
    context: z.array(range).min(1).max(20).describe('The line ranges the worker needs; kvcoder attaches their current text, up to 20 KB in all, so it reads nothing you already hold.').exactOptional(),
    budget: z.number().int().min(1).max(budgetLimit).describe('The most steps the run takes, 60 by default.').exactOptional(),
  })
  .superRefine((run, issues) => {
    if (run.kind === 'change' && run.files === undefined) issues.addIssue({ code: 'custom', path: ['files'], message: 'A change run names the files it may change.' });
    if (run.kind !== 'change' && run.files !== undefined) issues.addIssue({ code: 'custom', path: ['files'], message: `A ${run.kind} run changes no file, so it takes no files.` });
  });

export type DelegateRun = z.output<typeof delegateRunSchema>;

/** Fails `VALIDATION_FAILED` for a path of `files` or `context` outside the workspace folder; gives the files' real paths. */
export async function checkedFiles(ctx: Ctx, run: DelegateRun): Promise<string[] | null> {
  const workspace = ctx.job.workspace.path;
  for (const entry of run.context ?? []) await resolveInWorkspace(workspace, entry.path);
  return run.files === undefined ? null : Promise.all(run.files.map((file) => resolveInWorkspace(workspace, file)));
}

// The ranges' text, up to the limit in all; a range past it is named, and one that can't be read says why, as
// `fs read-files` says it.
async function attached(ctx: Ctx, ranges: readonly z.output<typeof range>[]): Promise<string[]> {
  const parts: string[] = [];
  let left = contextLimit;
  for (const entry of ranges) {
    const named = `${entry.path} lines ${String(entry.fromLine ?? 1)}–${entry.lines === undefined ? 'end' : String((entry.fromLine ?? 1) + entry.lines - 1)}`;
    if (left <= 0) {
      parts.push(`${named} · not attached (over 20 KB)`);
      continue;
    }
    try {
      // A range that only partly fits is attached as far as whole lines fit, and says where to read on.
      const read = await readLines(ctx.job.workspace.path, entry, undefined, left);
      if (read.truncated && !read.content.includes('\n')) {
        parts.push(`${named} · not attached (over 20 KB)`);
        left = 0;
        continue;
      }
      left -= Buffer.byteLength(read.content);
      parts.push(readText(read));
    } catch (error) {
      if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
      parts.push(`${entry.path} · error ${error.problem.code}: ${error.problem.message}`);
    }
  }
  return parts;
}

/** The helper's first message, and the run its session keeps. */
export async function briefOf(ctx: Ctx, run: DelegateRun): Promise<{ task: string; brief: RunBrief }> {
  const files = await checkedFiles(ctx, run);
  const lines = [`Kind: ${run.kind}`, `Goal: ${run.goal}`, `Done when: ${run.done}`];
  if (run.files !== undefined) lines.push(`You may change only: ${run.files.join(', ')}`, "A shell line isn't limited to these files: change nothing else with it.");
  const context = await attached(ctx, run.context ?? []);
  const task = [lines.join('\n'), ...(context.length === 0 ? [] : [`## Context\n\n${context.join('\n\n')}`])].join('\n\n');
  return { task, brief: { kind: run.kind, goal: run.goal, files, budget: run.budget ?? budgetLimit } };
}
