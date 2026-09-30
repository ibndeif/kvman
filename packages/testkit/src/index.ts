import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { homeWorkspaceId, openSecretsFile, startKernel, type LogLevel } from '@kvman/kernel';
import { z, type Caller, type InputOf, type Json, type OutputOf } from '@kvman/sdk';

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

/** A real kernel in-process, with a temporary home and no HTTP. */
export type TestKernel = {
  /** The temporary kvman home. */
  home: string;
  /** The temporary folder of the Home workspace. */
  homeFolder: string;
  /** Runs a command or query now and resolves to its output. */
  exec<Name extends string>(name: Name, input: InputOf<Name>, options?: TestCallOptions): Promise<OutputOf<Name>>;
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

/** Starts a test kernel: one worker unless `settings` set `kernel.workers`, and a temporary Home (ADR 0009, 10 and 11). */
export async function createTestKernel(options: TestKernelOptions): Promise<TestKernel> {
  const root = mkdtempSync(path.join(tmpdir(), 'kvman-test-'));
  const home = path.join(root, 'home');
  const homeFolder = path.join(root, 'home-folder');
  mkdirSync(home);
  mkdirSync(homeFolder);
  const secrets = openSecretsFile(home);
  for (const [extension, values] of Object.entries(options.secrets ?? {})) {
    for (const [name, value] of Object.entries(values)) secrets.set(extension, name, value);
  }
  const folders = options.extensions.map((folder) => path.resolve(folder));
  const extensions = Object.fromEntries(folders.map((folder): [string, `path:${string}`] => [packageName(folder), `path:${folder}`]));
  try {
    const kernel = await startKernel({
      home,
      homeFolder,
      preset: { name: 'test', extensions, settings: { 'kernel.workers': 1, ...options.settings } },
      presetFolder: process.cwd(),
      bundled: new Map(),
      logLevel: options.logLevel ?? 'debug',
    });
    return {
      home,
      homeFolder,
      exec: async <Name extends string>(name: Name, input: InputOf<Name>, callOptions?: TestCallOptions) => {
        const output = await kernel.exec(name, input, { caller: callerOf(callOptions), workspaceId: callOptions?.workspaceId ?? homeWorkspaceId });
        // The kernel checked the output against the registered schema; the declared type is the callee's promise.
        return output as OutputOf<Name>;
      },
      close: async () => {
        await kernel.close();
        rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
