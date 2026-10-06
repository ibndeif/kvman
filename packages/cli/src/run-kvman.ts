import { discardPresetBackup, startHttp, type Kernel } from '@kvman/kernel';
import { kvmanHome, type RunArguments } from './arguments.ts';
import { openBrowser } from './browser.ts';
import { bundledPresetsFolder } from './bundled.ts';
import { handOver } from './hand-over.ts';
import { takeLock, type Lock, type TakenLock } from './lock-file.ts';
import { defaultPreset, editableFile, findPreset, type PresetFolders } from './preset-lookup.ts';
import { startOrUndo } from './start-kernel.ts';
import { listenForStop } from './stop-signals.ts';
import type { Terminal } from './trust-prompt.ts';

// A kvman run (plan 01 §1.2, plan 02 §2.14, ADR 0024): take the lock or hand over, start the kernel and HTTP, print and
// open the URL, and stop on Ctrl+C or start again when the kernel asks for a restart. It resolves to the exit code; a
// failed start throws its Problem.

export type CliEnvironment = {
  variables: NodeJS.ProcessEnv;
  startFolder: string;
  userFolder: string;
  platform: NodeJS.Platform;
  terminal: Terminal;
  errors: NodeJS.WritableStream;
  exitAtOnce: (code: number) => never;
};

function workspaceUrl(port: number, workspaceId: string): string {
  return `http://127.0.0.1:${String(port)}/?workspace=${encodeURIComponent(workspaceId)}`;
}

async function joinRunning(args: RunArguments, lock: Lock, folders: PresetFolders, environment: CliEnvironment): Promise<number> {
  const preset = args.preset === undefined ? undefined : findPreset(args.preset, folders).preset.name;
  const { port, workspace } = await handOver(lock, environment.startFolder, { preset, mode: args.mode });
  const url = workspaceUrl(port, workspace.id);
  environment.terminal.output.write(`kvman is already running; this folder is open at ${url}\n`);
  if (args.open) openBrowser(environment.platform, url, (reason) => environment.errors.write(`The browser could not be opened (${reason}).\n`));
  return 0;
}

type Outcome = 'stopped' | 'restart';

// A good start (the port is listening) deletes the backup of the last edit (ADR 0024, 4).
async function serve(args: RunArguments, kernel: Kernel, lock: TakenLock, environment: CliEnvironment, run: { open: boolean; presetFile: string }): Promise<Outcome> {
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
    environment.terminal.output.write(`kvman is running at ${url}\n`);
    if (run.open) openBrowser(environment.platform, url, (reason) => kernel.web.logger.warn('The browser could not be opened.', { reason }));
    const requested = await Promise.race([stop.stopRequested.then((): Outcome => 'stopped'), kernel.restartRequested.then((): Outcome => 'restart')]);
    const closing = http.close();
    await kernel.close();
    await closing;
    return stop.isRequested() ? 'stopped' : requested;
  } finally {
    stop.dispose();
  }
}

export async function runKvman(args: RunArguments, environment: CliEnvironment): Promise<number> {
  const home = kvmanHome(args.home, environment.variables, environment.userFolder);
  const folders: PresetFolders = { bundled: bundledPresetsFolder, home, start: environment.startFolder };
  const lock = takeLock(home);
  if (lock.kind === 'held') return joinRunning(args, lock.lock, folders, environment);
  // A program kvman runs (kvcustomizer's `kvman-docs`) finds this kvman through `<home>/kvman.lock` (plan 01 §1.2).
  process.env['KVMAN_HOME'] = home;
  const presetFile = editableFile(args.preset ?? defaultPreset, folders);
  try {
    for (let open = args.open; ; open = false) {
      const kernel = await startOrUndo(args, folders, environment);
      if ((await serve(args, kernel, lock, environment, { open, presetFile })) === 'stopped') return 0;
      environment.terminal.output.write('kvman is restarting…\n');
    }
  } finally {
    lock.release();
  }
}
