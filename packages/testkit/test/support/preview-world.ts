import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { writeFakeKvman } from './fake-kvman.ts';
import { repositoryRoot } from './npm-mirror.ts';

// A sandbox for the `kvman-preview` tests (09 §9.3): temporary folders for fake kvmen and demo projects, a starter
// for the long-running bin that resolves once its first line is printed, and cleanup that kills every child and
// removes every folder and preview home. Runs that finish use `runBin` instead.

/** A running preview bin: its first stdout line, its end, and a way to signal it. */
export type PreviewHandle = {
  child: ChildProcess;
  stdoutText(): string;
  stderrText(): string;
  /** The first full stdout line; rejects when the bin exits before printing one. */
  line: Promise<string>;
  /** How the bin ended. */
  exit: Promise<{ code: number; signal: NodeJS.Signals | null }>;
  signal(name: NodeJS.Signals): void;
};

const previewBinFile = path.join(repositoryRoot, 'packages/testkit/dist/preview/preview-bin.js');

/** The preview home the bin uses for `name`: `<os temp>/kvman-preview-<name>`. */
export function previewHomePath(name: string): string {
  return path.join(tmpdir(), `kvman-preview-${name}`);
}

/** Whether `pid` names a live process; a pid that can't be signaled is gone. */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

/** Resolves once `file` exists; rejects after `withinMs` with what was waited for. */
export async function waitForFile(file: string, withinMs: number): Promise<void> {
  const deadline = Date.now() + withinMs;
  while (!existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${file} after ${String(withinMs)} ms.`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function startPreviewBin(args: readonly string[], cwd: string, env: Record<string, string | undefined>): PreviewHandle {
  const nodeArgs = [...process.execArgv];
  if (!nodeArgs.includes('--conditions=@kvman/source')) nodeArgs.push('--conditions=@kvman/source');
  const child = spawn(process.execPath, [...nodeArgs, previewBinFile, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  let seenLine = false;
  let resolveLine: (line: string) => void = () => {};
  let rejectLine: (error: Error) => void = () => {};
  const line = new Promise<string>((resolve, reject) => {
    resolveLine = resolve;
    rejectLine = reject;
  });
  const finishLine = (): void => {
    if (seenLine) return;
    const at = stdout.indexOf('\n');
    if (at === -1) return;
    seenLine = true;
    resolveLine(stdout.slice(0, at).replace(/\r$/, ''));
  };
  child.stdout?.setEncoding('utf8').on('data', (text: string) => {
    stdout += text;
    finishLine();
  });
  child.stderr?.setEncoding('utf8').on('data', (text: string) => {
    stderr += text;
  });
  const exit = new Promise<{ code: number; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('exit', (code, signal) => {
      if (!seenLine) {
        seenLine = true;
        rejectLine(new Error(`The preview bin exited before printing a line.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      }
      resolve({ code: code ?? 1, signal });
    });
  });
  return {
    child,
    stdoutText: () => stdout,
    stderrText: () => stderr,
    line,
    exit,
    signal: (name) => {
      child.kill(name);
    },
  };
}

const demoEntry = `import { z } from '@kvman/sdk';

export default (ctx) => {
  ctx.registerQuery('demo.answer', {
    description: 'Answers 42.',
    public: true,
    input: z.object({}),
    output: z.strictObject({ answer: z.number() }),
    handle: () => ({ answer: 42 }),
  });
};
`;

const buildScript = `require('node:fs').writeFileSync(require('node:path').join(__dirname, 'built.txt'), 'built\\n');
`;

const watchScript = `const fs = require('node:fs');
const file = require('node:path').join(__dirname, 'watch.pid');
fs.writeFileSync(file, String(process.pid));
setInterval(() => {}, 1000000);
`;

/** What `writeProject` accepts: the package name and the npm scripts of the demo project. */
export type PreviewProjectInit = {
  packageName?: string | undefined;
  scripts?: Record<string, string> | undefined;
};

/** One sandbox: folders under a temporary root, with cleanup of children, homes, and folders. */
export type PreviewSandbox = {
  root: string;
  /** A fresh folder for one test's files. */
  folder(name: string): string;
  /** A fake kvman entry with its log file. */
  fake(name: string): { entry: string; log: string };
  /** A demo extension project answering `demo.answer` with 42. */
  project(name: string, init?: PreviewProjectInit): { folder: string; packageName: string };
  /** Starts the long-running preview bin; its `--name` home is removed at cleanup. */
  start(args: readonly string[], options: { cwd: string; env?: Record<string, string | undefined> }): PreviewHandle;
  /** A `kvman` shim on a folder put at the front of PATH, running `node <fake>` with its arguments. */
  pathShim(name: string, fakeEntry: string): { folder: string; env: Record<string, string | undefined> };
};

/** Makes sandboxes, one per test, cleaned after each test. */
export function usePreviewSandbox(): () => PreviewSandbox {
  const roots: string[] = [];
  const handles: PreviewHandle[] = [];
  const homes: string[] = [];
  afterEach(async () => {
    for (const handle of handles.splice(0)) {
      if (handle.child.exitCode === null && handle.child.signalCode === null) handle.child.kill('SIGKILL');
      await handle.exit;
    }
    for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  let sandboxes = 0;
  return () => {
    sandboxes += 1;
    const root = mkdtempSync(path.join(tmpdir(), `kvman-preview-test-${String(sandboxes)}-`));
    roots.push(root);
    let members = 0;
    const folder = (name: string): string => {
      members += 1;
      const made = path.join(root, `${String(members)}-${name}`);
      mkdirSync(made, { recursive: true });
      return made;
    };
    const trackName = (args: readonly string[]): void => {
      const at = args.indexOf('--name');
      homes.push(previewHomePath(at === -1 ? 'preview' : String(args[at + 1])));
    };
    return {
      root,
      folder,
      fake: (name) => {
        const made = folder(name);
        const entry = writeFakeKvman(made);
        return { entry, log: path.join(made, 'fake.log') };
      },
      project: (name, init) => {
        const made = folder(name);
        const packageName = init?.packageName ?? '@preview/demo';
        const manifest: Record<string, unknown> = {
          name: packageName,
          version: '0.1.0',
          main: 'index.js',
          peerDependencies: { '@kvman/sdk': '^0.1.0' },
          type: 'module',
          kvman: { namespace: 'demo' },
        };
        if (init?.scripts !== undefined) manifest['scripts'] = init.scripts;
        writeFileSync(path.join(made, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`);
        writeFileSync(path.join(made, 'index.js'), demoEntry);
        writeFileSync(path.join(made, 'build.cjs'), buildScript);
        writeFileSync(path.join(made, 'watch.cjs'), watchScript);
        return { folder: made, packageName };
      },
      start: (args, options) => {
        trackName(args);
        const handle = startPreviewBin(args, options.cwd, options.env ?? {});
        handles.push(handle);
        return handle;
      },
      pathShim: (name, fakeEntry) => {
        const made = folder(name);
        if (process.platform === 'win32') {
          writeFileSync(path.join(made, 'kvman.cmd'), `@node "${fakeEntry}" %*\r\n`);
        } else {
          const shim = path.join(made, 'kvman');
          writeFileSync(shim, `#!/bin/sh\nexec node "${fakeEntry}" "$@"\n`);
          chmodSync(shim, 0o755);
        }
        const separator = process.platform === 'win32' ? ';' : ':';
        return { folder: made, env: { PATH: `${made}${separator}${process.env['PATH'] ?? ''}` } };
      },
    };
  };
}
