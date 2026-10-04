import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { envelopeSchema, healthSchema, presetSchema, z } from '@kvman/sdk';
import { BinFailure } from '../bin/bin-failure.ts';
import { lastLines, runProgram } from '../bin/run-program.ts';
import { preparePreviewHome } from './preview-home.ts';
import { readPreviewProject } from './preview-manifest.ts';
import { previewPort } from './preview-port.ts';
import { previewPreset, type GivenPreset } from './preview-preset.ts';
import { isRunning, killProcessTree, spawnCommand, stopPreviewChild, trackChild, type TrackedChild } from './process-tree.ts';

// `kvman-preview`'s run (plan 09 §9.3, ADR 0010, 7, 21): a fresh home and generated preset, one `web:build` then a
// `web:watch` child per project that has one, the preview kvman as a child, and its URL once it answers
// `kernel.health.get`. `shutdown` stops the preview, the watchers, and removes the home on every exit path, so no
// child or home is ever left behind. The readiness poll and the preview's stop wait are the only timers.

const readyWithinMs = 30_000;
const pollEveryMs = 200;
const stopPreviewWithinMs = 10_000;
const maxPreviewOutput = 65_536;

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

/** What the preview runs: folders resolved against the current working folder, preset and entry files with them. */
export type PreviewRunOptions = {
  /** Extension project folders, resolved against the current working folder. */
  folders: readonly string[];
  /** A preset file the preview builds on, or `undefined` for the generated one. */
  preset?: string | undefined;
  /** The kvman entry file to run, or `undefined` for the `kvman` on the PATH. */
  kvman?: string | undefined;
  /** Names the home `<os temp>/kvman-preview-<name>`. */
  name: string;
};

type ResolvedProject = { given: string; absolute: string; name: string; webWatch: boolean };

type PreviewState = {
  home: string;
  preview: TrackedChild | undefined;
  previewOutput: () => string;
  watchers: TrackedChild[];
  kvmanFromPath: boolean;
};

function checkProjects(folders: readonly string[]): ResolvedProject[] {
  return folders.map((folder) => {
    const project = readPreviewProject(path.resolve(folder));
    if (project === undefined) throw new BinFailure('VALIDATION_FAILED', `${folder} has no package.json with a kvman field.`, { folder });
    return { given: folder, absolute: path.resolve(folder), name: project.name, webWatch: project.webWatch };
  });
}

function readGivenPreset(file: string | undefined): GivenPreset | undefined {
  if (file === undefined) return undefined;
  const absolute = path.resolve(file);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(absolute, 'utf8'));
  } catch {
    throw new BinFailure('VALIDATION_FAILED', `The preset ${file} is invalid; run kvman-preset check on it.`, { preset: file });
  }
  const parsed = presetSchema.safeParse(raw);
  if (!parsed.success) throw new BinFailure('VALIDATION_FAILED', `The preset ${file} is invalid; run kvman-preset check on it.`, { preset: file });
  return { preset: parsed.data, folder: path.dirname(absolute) };
}

function checkKvmanEntry(entry: string | undefined): string | undefined {
  if (entry === undefined) return undefined;
  if (!existsSync(path.resolve(entry))) {
    throw new BinFailure('VALIDATION_FAILED', `The kvman entry ${entry} doesn't exist; pass the entry file of the kvman to run.`, { kvman: entry });
  }
  return path.resolve(entry);
}

/** SIGINT and SIGTERM as the bin sees them: listeners run once, and a second signal changes nothing. */
type SignalWaiter = {
  signalled: () => boolean;
  onSignal: (listener: () => void) => () => void;
  dispose: () => void;
};

function waitForSignals(): SignalWaiter {
  const listeners = new Set<() => void>();
  let fired = false;
  const fire = (): void => {
    if (fired) return;
    fired = true;
    for (const listener of [...listeners]) listener();
  };
  const onSigint = (): void => fire();
  const onSigterm = (): void => fire();
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  return {
    signalled: () => fired,
    onSignal: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      listeners.clear();
    },
  };
}

async function answers(url: string): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`${url}api/queries/kernel.health.get`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"input":{}}',
      signal: AbortSignal.timeout(pollEveryMs * 5),
    });
  } catch (error) {
    // A refused connection is a TypeError; a preview that accepts and never replies ends the attempt with a TimeoutError.
    if (error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError')) return false;
    throw error;
  }
  if (!response.ok) return false;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return false;
  }
  const parsed = envelopeSchema({ output: healthSchema, jobId: z.string() }).safeParse(body);
  return parsed.success && parsed.data.ok;
}

function previewStopped(state: PreviewState): BinFailure | undefined {
  const preview = state.preview;
  if (preview === undefined || isRunning(preview)) return undefined;
  if (state.kvmanFromPath && preview.spawnError !== undefined && hasCode(preview.spawnError, 'ENOENT')) {
    return new BinFailure('PREVIEW_FAILED', `kvman isn't on the PATH; install it with npm i -g kvman, or pass --kvman <entry>.`);
  }
  return new BinFailure('PREVIEW_FAILED', `The preview kvman exited before it answered:\n${lastLines(state.previewOutput())}`);
}

async function waitUntilReady(url: string, state: PreviewState, signals: SignalWaiter): Promise<boolean> {
  const deadline = Date.now() + readyWithinMs;
  while (Date.now() < deadline) {
    if (signals.signalled()) return false;
    if (await answers(url)) return true;
    const stopped = previewStopped(state);
    if (stopped !== undefined) throw stopped;
    if (signals.signalled()) return false;
    await delay(pollEveryMs);
  }
  throw new BinFailure('PREVIEW_FAILED', `The preview kvman didn't answer within 30 s:\n${lastLines(state.previewOutput())}`);
}

async function startWatchers(projects: readonly ResolvedProject[], state: PreviewState, signals: SignalWaiter): Promise<void> {
  for (const project of projects) {
    if (!project.webWatch || signals.signalled()) continue;
    const build = await runProgram('npm', ['run', 'web:build'], project.absolute);
    if (build.exitCode !== 0) throw new BinFailure('PREVIEW_FAILED', `npm run web:build failed in ${project.given}:\n${lastLines(build.output)}`);
    if (signals.signalled()) return;
    const watch = spawnCommand(process.platform, 'npm', ['run', 'web:watch']);
    const child = spawn(watch.command, watch.args, { cwd: project.absolute, stdio: 'ignore', detached: watch.detached, windowsHide: true });
    state.watchers.push(trackChild(child));
  }
}

function startPreviewChild(state: PreviewState, options: { home: string; port: number; presetFile: string; kvmanEntry: string | undefined }): void {
  const kvmanArgs = ['--home', options.home, '--port', String(options.port), '--yes', '--no-open', '--preset', options.presetFile];
  const start =
    options.kvmanEntry === undefined
      ? spawnCommand(process.platform, 'kvman', kvmanArgs)
      : spawnCommand(process.platform, process.execPath, [...process.execArgv, options.kvmanEntry, ...kvmanArgs]);
  const child = spawn(start.command, start.args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: start.detached, windowsHide: true });
  const tracked = trackChild(child);
  state.preview = tracked;
  let output = '';
  const append = (text: string): void => {
    output += text;
    if (output.length > maxPreviewOutput) output = output.slice(-maxPreviewOutput);
  };
  child.stdout?.setEncoding('utf8').on('data', append);
  child.stderr?.setEncoding('utf8').on('data', append);
  state.previewOutput = () => output;
}

async function waitWhileRunning(state: PreviewState, signals: SignalWaiter): Promise<'exited' | 'signalled'> {
  const preview = state.preview;
  if (preview === undefined || signals.signalled() || !isRunning(preview)) return signals.signalled() ? 'signalled' : 'exited';
  return await new Promise<'exited' | 'signalled'>((resolve) => {
    let settled = false;
    const settle = (outcome: 'exited' | 'signalled'): void => {
      if (settled) return;
      settled = true;
      offSignal();
      preview.child.off('exit', onExit);
      preview.child.off('close', onExit);
      resolve(outcome);
    };
    const offSignal = signals.onSignal(() => settle('signalled'));
    const onExit = (): void => settle('exited');
    preview.child.once('exit', onExit);
    preview.child.once('close', onExit);
    if (signals.signalled() || !isRunning(preview)) settle(signals.signalled() ? 'signalled' : 'exited');
  });
}

// The one stop every exit path uses: the preview first (SIGINT, 10 s, then its group; the tree on Windows), then
// each `web:watch` tree, then the home.
async function shutdown(state: PreviewState): Promise<void> {
  if (state.preview !== undefined) await stopPreviewChild(state.preview, stopPreviewWithinMs);
  for (const watcher of state.watchers) await killProcessTree(watcher);
  rmSync(state.home, { recursive: true, force: true });
}

/** Runs the preview until SIGINT or SIGTERM, or the preview kvman exits; failures are `BinFailure`s. */
export async function runPreview(options: PreviewRunOptions, onReady: (url: string) => void): Promise<void> {
  const projects = checkProjects(options.folders);
  const given = readGivenPreset(options.preset);
  const kvmanEntry = checkKvmanEntry(options.kvman);
  const home = preparePreviewHome(options.name);
  const state: PreviewState = { home, preview: undefined, previewOutput: () => '', watchers: [], kvmanFromPath: kvmanEntry === undefined };
  const signals = waitForSignals();
  let failure: BinFailure | undefined;
  try {
    const port = await previewPort();
    const presetFile = path.join(home, 'preview-preset.json');
    writeFileSync(presetFile, JSON.stringify(previewPreset(projects.map((project) => ({ name: project.name, folder: project.absolute })), given)));
    if (!signals.signalled()) {
      await startWatchers(projects, state, signals);
      if (!signals.signalled()) {
        startPreviewChild(state, { home, port, presetFile, kvmanEntry });
        const url = `http://127.0.0.1:${String(port)}/`;
        if (await waitUntilReady(url, state, signals)) {
          onReady(url);
          if ((await waitWhileRunning(state, signals)) === 'exited') {
            failure = new BinFailure('PREVIEW_FAILED', `The preview kvman exited:\n${lastLines(state.previewOutput())}`);
          }
        }
      }
    }
  } catch (error) {
    if (!(error instanceof BinFailure)) throw error;
    failure = error;
  } finally {
    signals.dispose();
    await shutdown(state);
  }
  if (failure !== undefined) throw failure;
}
