import { discardPresetBackup, startHttp, storedLanguage, type Kernel } from '@kvman/kernel';
import { ProblemError } from '@kvman/sdk';
import { kvmanHome, type RunArguments } from './arguments.ts';
import { openBrowser } from './browser.ts';
import { bundledPresetsFolder } from './bundled.ts';
import { handOver } from './hand-over.ts';
import { takeLock, type Lock, type TakenLock } from './lock-file.ts';
import { failedLine } from './pipe/pipe-lines.ts';
import { pipeTrustDecision } from './pipe/pipe-trust.ts';
import { openPipe, type Pipe } from './pipe/pipe.ts';
import { defaultPreset, editableFile, findPreset, type PresetFolders } from './preset-lookup.ts';
import { pipeReport, terminalReport, type RunReport } from './run-report.ts';
import { startOrUndo, type TrustFor } from './start-kernel.ts';
import { listenForStop } from './stop-signals.ts';
import { trustDecision, type Terminal } from './trust-prompt.ts';

// A kvman run (plan 01 §1.2, plan 02 §2.14, ADR 0024): take the lock or hand over, start the kernel and HTTP, print and
// open the URL, and stop on Ctrl+C or start again when the kernel asks for a restart. It resolves to the exit code; a
// failed start throws its Problem. With `--pipe` (plan 14 §14.2) it writes lines in place of the sentences, and an
// input that ends stops it as the first Ctrl+C does.

export type CliEnvironment = {
  variables: NodeJS.ProcessEnv;
  startFolder: string;
  userFolder: string;
  platform: NodeJS.Platform;
  terminal: Terminal;
  errors: NodeJS.WritableStream;
  exitAtOnce: (code: number) => never;
};

type Talk = { report: RunReport; pipe: Pipe | undefined };

function workspaceUrl(port: number, workspaceId: string): string {
  return `http://127.0.0.1:${String(port)}/?workspace=${encodeURIComponent(workspaceId)}`;
}

async function joinRunning(args: RunArguments, lock: Lock, folders: PresetFolders, environment: CliEnvironment, report: RunReport): Promise<number> {
  const preset = args.preset === undefined ? undefined : findPreset(args.preset, folders).preset.name;
  const { port, workspace } = await handOver(lock, environment.startFolder, { preset, mode: args.mode });
  const url = workspaceUrl(port, workspace.id);
  report.joined(url, port);
  if (args.open) openBrowser(environment.platform, url, (reason) => environment.errors.write(`The browser could not be opened (${reason}).\n`));
  return 0;
}

type Outcome = 'stopped' | 'restart';

// A good start (the port is listening) deletes the backup of the last edit (ADR 0024, 4).
async function serve(args: RunArguments, kernel: Kernel, lock: TakenLock, environment: CliEnvironment, run: { open: boolean; presetFile: string; talk: Talk }): Promise<Outcome> {
  const { report, pipe } = run.talk;
  const stop = listenForStop(() => {
    lock.release();
    environment.exitAtOnce(130);
  });
  try {
    const http = await startHttp(kernel, { port: args.port ?? kernel.web.port() }).catch(async (error: unknown) => {
      await kernel.close();
      throw error;
    });
    lock.setPort(http.port);
    discardPresetBackup(run.presetFile);
    const url = workspaceUrl(http.port, kernel.startWorkspace.id);
    report.running(url, http.port);
    if (run.open) openBrowser(environment.platform, url, (reason) => kernel.web.logger.warn('The browser could not be opened.', { reason }));
    const stopped = (): Outcome => 'stopped';
    const requested = await Promise.race([
      stop.stopRequested.then(stopped),
      ...(pipe === undefined ? [] : [pipe.ended.then(stopped)]),
      kernel.restartRequested.then((): Outcome => 'restart'),
    ]);
    const closing = http.close();
    await kernel.close();
    await closing;
    return stop.isRequested() || pipe?.hasEnded() === true ? 'stopped' : requested;
  } finally {
    stop.dispose();
  }
}

async function runWith(args: RunArguments, environment: CliEnvironment, talk: Talk): Promise<number> {
  const home = kvmanHome(args.home, environment.variables, environment.userFolder);
  const folders: PresetFolders = { bundled: bundledPresetsFolder, home, start: environment.startFolder };
  // Known once a start has found its preset; a `failed` line before that has no language (ADR 0038, 18).
  let language: (() => string) | undefined;
  const trustFor: TrustFor = (presetSettings) => {
    const stored = (): string => storedLanguage(home, presetSettings);
    language = stored;
    return talk.pipe === undefined ? trustDecision(args.yes, environment.terminal) : pipeTrustDecision(args.yes, talk.pipe, stored);
  };
  try {
    const lock = takeLock(home);
    if (lock.kind === 'held') return await joinRunning(args, lock.lock, folders, environment, talk.report);
    // A program kvman runs (kvbuilder's `kvman-docs`) finds this kvman through `<home>/kvman.lock` (plan 01 §1.2).
    process.env['KVMAN_HOME'] = home;
    const presetFile = editableFile(args.preset ?? defaultPreset, folders);
    try {
      for (let open = args.open; ; open = false) {
        const kernel = await startOrUndo(args, folders, environment, trustFor);
        if ((await serve(args, kernel, lock, environment, { open, presetFile, talk })) === 'stopped') return 0;
        talk.report.restarting();
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    if (talk.pipe !== undefined && error instanceof ProblemError) talk.pipe.write(failedLine(error.problem, language?.()));
    throw error;
  }
}

export async function runKvman(args: RunArguments, environment: CliEnvironment): Promise<number> {
  if (!args.pipe) return runWith(args, environment, { report: terminalReport(environment.terminal.output), pipe: undefined });
  const pipe = openPipe(environment.terminal);
  try {
    return await runWith(args, environment, { report: pipeReport(pipe), pipe });
  } finally {
    pipe.dispose();
  }
}
