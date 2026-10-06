import { setTimeout as delay } from 'node:timers/promises';
import { ProblemError, z, type Ctx } from '@kvman/sdk';
import { insideWorkspace, projectAt } from '../folders.ts';
import { kvbuilderProblem } from '../problems.ts';
import { binFailureProblem, binFailureSchema, binFile } from '../run-bin.ts';
import { lastLines } from '../run-program.ts';
import { cleanUpPreview, recordKey, type PreviewRecord } from './preview-state.ts';

// `preview start` (plan 09 §9.3, ADR 0010, 21): `kvman-preview` runs through the process service in the workspace
// folder, so its folders and preset stay as given; the call answers once the ready line `{ url }` shows in the
// process log. When the bin exits first, its failure line becomes its Problem.

const pollEveryMs = 200;

const readySchema = z.object({ url: z.string() });

function readyUrl(log: string): string | undefined {
  for (const line of log.split('\n')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const ready = readySchema.safeParse(parsed);
    if (ready.success) return ready.data.url;
  }
  return undefined;
}

// The bin's failure: the last JSON failure line becomes its Problem; with none, `kvbuilder/PREVIEW_FAILED` with
// the last lines.
function previewFailure(log: string): ProblemError {
  const lines = log.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined || line.trim() === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const failure = binFailureSchema.safeParse(parsed);
    if (!failure.success) continue;
    const problem = binFailureProblem(failure.data);
    if (problem !== undefined) return problem;
    break;
  }
  return kvbuilderProblem('PREVIEW_FAILED', `The preview exited before it was ready:\n${lastLines(log)}`);
}

async function waitForReady(ctx: Ctx): Promise<string> {
  while (true) {
    if (!(await ctx.processes.list()).some((process) => process.name === 'preview')) {
      throw previewFailure(await ctx.processes.log('preview', { tail: 20 }));
    }
    const ready = readyUrl(await ctx.processes.log('preview', { tail: 20 }));
    if (ready !== undefined) return ready;
    await delay(pollEveryMs, undefined, { signal: ctx.job.signal });
  }
}

async function stopIfRunning(ctx: Ctx): Promise<void> {
  try {
    await ctx.processes.stop('preview');
  } catch (error) {
    if (!(error instanceof ProblemError && error.problem.code === 'NOT_FOUND')) throw error;
  }
}

export async function startPreview(ctx: Ctx, input: { extensions: string[]; preset?: string | undefined }): Promise<{ url: string }> {
  const workspaceFolder = ctx.job.workspace.path;
  for (const folder of input.extensions) projectAt(workspaceFolder, folder);
  if (input.preset !== undefined) insideWorkspace(workspaceFolder, input.preset, 'preset');
  const entry = process.argv[1];
  if (entry === undefined) throw kvbuilderProblem('PREVIEW_FAILED', "kvman's entry file isn't known in this process.");
  if ((await ctx.processes.list()).some((process) => process.name === 'preview')) {
    throw new ProblemError({ code: 'PROCESS_RUNNING', message: 'A preview already runs in this workspace; run preview stop first.', params: { name: 'preview' } });
  }
  await ctx.processes.start('preview', {
    command: process.execPath,
    args: [...process.execArgv, binFile('kvman-preview'), ...input.extensions, '--kvman', entry, '--name', ctx.job.workspace.id, '--json', ...(input.preset === undefined ? [] : ['--preset', input.preset])],
    cwd: workspaceFolder,
  });
  try {
    const url = await waitForReady(ctx);
    const record: PreviewRecord = { url, extensions: input.extensions };
    await ctx.store.kv.set(recordKey, record);
    return { url };
  } catch (error) {
    if ((await ctx.processes.list()).some((process) => process.name === 'preview')) await stopIfRunning(ctx);
    await cleanUpPreview(ctx);
    throw error;
  }
}
