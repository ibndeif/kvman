import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { homeWorkspaceId, openSecretsFile, startKernel, type Kernel, type LogLevel } from '@kvman/kernel';
import { z, type Caller, type CommandInputOf, type InputOf, type Job, type Json, type OutputOf, type Preset } from '@kvman/sdk';
import { createFakeClock, type TestClock } from './fake-clock.ts';

export type { TestClock } from './fake-clock.ts';

/** What a test kernel starts with (plan 10). */
export type TestKernelOptions = {
  /** Folders of the extensions to load, relative to the working folder; each loads as a `path:` extension. */
  extensions: readonly string[];
  /** The run's preset settings. */
  settings?: Readonly<Record<string, Json>>;
  /** Secrets to write before the extensions load: `{ "<extension package>": { "<name>": "<value>" } }`. */
  secrets?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** The log level of the test kernel's `logs/kvman.log` (default `debug`). */
  logLevel?: LogLevel;
};

/** How a test call runs: as the user (the default) or as an extension, in Home or another workspace. */
export type TestCallOptions = {
  /** The package name of the extension to call as. */
  as?: string;
  /** The workspace to run in (default Home). */
  workspaceId?: string;
};

/** A real kernel in-process, with a temporary home, a fake clock, and no HTTP. */
export type TestKernel = {
  /** The temporary kvman home. */
  home: string;
  /** The temporary folder of the Home workspace. */
  homeFolder: string;
  /** The fake clock of the kernel's own timers: retries, schedules, retention, and ids. */
  clock: TestClock;
  /** Runs a command or query now and resolves to its output. */
  exec<Name extends string>(name: Name, input: InputOf<Name>, options?: TestCallOptions): Promise<OutputOf<Name>>;
  /** Queues a command and resolves to its job id. */
  execAsync<Name extends string>(name: Name, input: CommandInputOf<Name>, options?: TestCallOptions): Promise<string>;
  /** Resolves with the job once it has ended. */
  waitForJob(jobId: string): Promise<Job>;
  /** Cancels a job. */
  cancel(jobId: string): void;
  /** Stops the kernel as Ctrl+C does, moves the fake clock by `stoppedForMs` (default 0), then starts it again on the same home. */
  restart(options?: { stoppedForMs?: number }): Promise<void>;
  /** Stops the kernel and removes its temporary folders. */
  close(): Promise<void>;
};

const manifestNameSchema = z.object({ name: z.string() });

function packageName(folder: string): string {
  return manifestNameSchema.parse(JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8'))).name;
}

function callerOf(options: TestCallOptions | undefined): Caller {
  return options?.as === undefined ? { kind: 'user' } : { kind: 'extension', name: options.as };
}

function writeSecrets(home: string, values: TestKernelOptions['secrets']): void {
  const secrets = openSecretsFile(home);
  for (const [extension, named] of Object.entries(values ?? {})) {
    for (const [name, value] of Object.entries(named)) secrets.set(extension, name, value);
  }
}

/** Starts a test kernel: one worker unless `settings` set `kernel.workers`, and a temporary Home (ADR 0009, 10 and 11). */
export async function createTestKernel(options: TestKernelOptions): Promise<TestKernel> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvman-test-'));
  const home = path.join(root, 'home');
  const homeFolder = path.join(root, 'home-folder');
  mkdirSync(home);
  mkdirSync(homeFolder);
  writeSecrets(home, options.secrets);
  const folders = options.extensions.map((folder) => path.resolve(folder));
  const extensions = Object.fromEntries(folders.map((folder): [string, `path:${string}`] => [packageName(folder), `path:${folder}`]));
  const preset: Preset = { name: 'test', extensions, settings: { 'kernel.workers': 1, ...options.settings } };
  const clock = createFakeClock(Date.now());
  const start = async (): Promise<Kernel> => {
    const started = await startKernel({ home, homeFolder, preset, presetFolder: process.cwd(), bundled: new Map(), mode: 'web', logLevel: options.logLevel ?? 'debug', clock: clock.kernelClock });
    clock.settleWith(() => started.settled());
    return started;
  };
  let kernel: Kernel;
  try {
    kernel = await start();
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
  const context = (callOptions: TestCallOptions | undefined) => ({ caller: callerOf(callOptions), workspaceId: callOptions?.workspaceId ?? homeWorkspaceId });
  return {
    home,
    homeFolder,
    clock: clock.testClock,
    exec: async <Name extends string>(name: Name, input: InputOf<Name>, callOptions?: TestCallOptions) => {
      const output = await kernel.exec(name, input, context(callOptions));
      // The kernel checked the output against the registered schema; the declared type is the callee's promise.
      return output as OutputOf<Name>;
    },
    execAsync: (name, input, callOptions) => kernel.execAsync(name, input, context(callOptions)),
    waitForJob: (jobId) => kernel.waitForJob(jobId),
    cancel: (jobId) => kernel.cancel(jobId),
    restart: async (restartOptions) => {
      await kernel.close();
      clock.moveWhileStopped(restartOptions?.stoppedForMs ?? 0);
      kernel = await start();
    },
    close: async () => {
      await kernel.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
