import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { presetSchema, ProblemError, type Ctx } from '@kvman/sdk';
import { insideWorkspace, projectAt } from '../folders.ts';
import { invalid, kvdevProblem } from '../problems.ts';
import { programCommand } from '../program-command.ts';
import { lastLines, runProgram } from '../run-program.ts';
import { previewCommand, previewPort, previewPreset, type GivenPreset } from './preview-preset.ts';
import { cleanUpPreview, isPortFree, previewHome, recordKey, type PreviewRecord } from './preview-state.ts';

// `preview start` (plan 09 §9.3, ADR 0009, 114, 124–126): each project with `web:watch` builds once, then runs
// `web:watch`; then a second kvman starts on its own home and the first free port from 3738, and the call returns once
// it answers `kernel.health.get`. After 30 s, or when it exits first, what started is stopped: `kvdev/PREVIEW_FAILED`.

const readyWithinMs = 30_000;
const pollEveryMs = 200;

function givenPreset(workspaceFolder: string, file: string): GivenPreset {
  const absolute = insideWorkspace(workspaceFolder, file, 'preset');
  const parsed = presetSchema.safeParse(JSON.parse(readFileSync(absolute, 'utf8')));
  if (!parsed.success) throw invalid(`The preset ${file} is invalid; run preset check on it.`, { preset: file });
  return { preset: parsed.data, folder: path.dirname(absolute) };
}

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}api/queries/kernel.health.get`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":{}}' });
    return response.ok;
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

async function failed(ctx: Ctx, why: string): Promise<never> {
  const log = await ctx.processes.log('preview', { tail: 20 });
  await cleanUpPreview(ctx, true);
  throw kvdevProblem('PREVIEW_FAILED', `${why}\n${lastLines(log)}`);
}

async function waitUntilReady(ctx: Ctx, url: string): Promise<void> {
  const deadline = Date.now() + readyWithinMs;
  while (Date.now() < deadline) {
    if (await answers(url)) return;
    if (!(await ctx.processes.list()).some((process) => process.name === 'preview')) await failed(ctx, 'The preview kvman exited before it answered:');
    await delay(pollEveryMs, undefined, { signal: ctx.job.signal });
  }
  await failed(ctx, `The preview kvman didn't answer within ${String(readyWithinMs / 1000)} s:`);
}

async function startWatchers(ctx: Ctx, folders: readonly string[]): Promise<void> {
  let index = 0;
  for (const folder of folders) {
    const build = await runProgram('npm', ['run', 'web:build'], folder, ctx.job.signal);
    if (build.exitCode !== 0) {
      await cleanUpPreview(ctx, true);
      throw kvdevProblem('PREVIEW_FAILED', `npm run web:build failed in ${folder}:\n${lastLines(build.output)}`);
    }
    index += 1;
    const watch = programCommand(process.platform, 'npm', ['run', 'web:watch']);
    await ctx.processes.start(`web-${String(index)}`, { command: watch.command, args: watch.args, cwd: folder });
  }
}

export async function startPreview(ctx: Ctx, input: { extensions: string[]; preset?: string | undefined }): Promise<{ url: string }> {
  const workspaceFolder = ctx.job.workspace.path;
  const projects = input.extensions.map((folder) => projectAt(workspaceFolder, folder));
  const given = input.preset === undefined ? undefined : givenPreset(workspaceFolder, input.preset);
  const entry = process.argv[1];
  if (entry === undefined) throw kvdevProblem('PREVIEW_FAILED', "kvman's entry file isn't known in this process.");
  if ((await ctx.processes.list()).some((process) => process.name === 'preview')) {
    throw new ProblemError({ code: 'PROCESS_RUNNING', message: 'A preview already runs in this workspace; run preview stop first.', params: { name: 'preview' } });
  }
  const port = await previewPort(isPortFree);
  if (port === undefined) throw kvdevProblem('NO_FREE_PORT', 'Ports 3738 to 3837 are all taken; stop something that listens on one.');
  const home = previewHome(ctx.job.workspace.id);
  await cleanUpPreview(ctx, false);
  mkdirSync(home, { recursive: true });
  const presetFile = path.join(home, 'preview-preset.json');
  writeFileSync(presetFile, JSON.stringify(previewPreset(projects.map((project) => ({ name: project.manifest.name, folder: project.folder })), given)));
  await startWatchers(ctx, projects.filter((project) => project.manifest.scripts['web:watch'] !== undefined).map((project) => project.folder));
  const url = `http://127.0.0.1:${String(port)}/`;
  const command = previewCommand({ execPath: process.execPath, execArgv: process.execArgv, entry, home, port, presetFile });
  await ctx.processes.start('preview', { command: command.command, args: command.args, cwd: workspaceFolder });
  await waitUntilReady(ctx, url);
  const record: PreviewRecord = { url, extensions: input.extensions };
  await ctx.store.kv.set(recordKey, record);
  return { url };
}
