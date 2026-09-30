import { startHttp, startKernel, type Kernel } from '@kvman/kernel';
import { kvmanHome, type RunArguments } from './arguments.ts';
import { openBrowser } from './browser.ts';
import { bundledExtensions, bundledPresetsFolder } from './bundled.ts';
import { handOver } from './hand-over.ts';
import { takeLock, type Lock, type TakenLock } from './lock-file.ts';
import { defaultPreset, findPreset, type PresetFolders } from './preset-lookup.ts';
import { listenForStop } from './stop-signals.ts';
import { trustDecision, type Terminal } from './trust-prompt.ts';

// A kvman run (plan 01 §1.2, plan 02 §2.14): take the lock or hand over, start the kernel and HTTP, print and open the
// URL, and stop on Ctrl+C. It resolves to the exit code; a failed start throws its Problem.

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

async function serve(args: RunArguments, kernel: Kernel, lock: TakenLock, environment: CliEnvironment): Promise<number> {
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
    const url = workspaceUrl(http.port, kernel.startWorkspace.id);
    environment.terminal.output.write(`kvman is running at ${url}\n`);
    if (args.open) openBrowser(environment.platform, url, (reason) => kernel.web.logger.warn('The browser could not be opened.', { reason }));
    await stop.stopRequested;
    const closing = http.close();
    await kernel.close();
    await closing;
    return 0;
  } finally {
    stop.dispose();
  }
}

export async function runKvman(args: RunArguments, environment: CliEnvironment): Promise<number> {
  const home = kvmanHome(args.home, environment.variables, environment.userFolder);
  const folders: PresetFolders = { bundled: bundledPresetsFolder, home, start: environment.startFolder };
  const lock = takeLock(home);
  if (lock.kind === 'held') return joinRunning(args, lock.lock, folders, environment);
  try {
    const found = findPreset(args.preset ?? defaultPreset, folders);
    const kernel = await startKernel({
      home,
      homeFolder: environment.userFolder,
      preset: found.preset,
      presetFolder: found.presetFolder,
      bundled: bundledExtensions(),
      mode: args.mode ?? 'web',
      logLevel: args.logLevel,
      terminalLog: true,
      startFolder: environment.startFolder,
      trust: trustDecision(args.yes, environment.terminal),
    });
    return await serve(args, kernel, lock, environment);
  } finally {
    lock.release();
  }
}
