import { fork, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { daemonStartReportSchema } from '@kvman/protocol';

export type Exit = { code: number | null; signal: NodeJS.Signals | null };

export type ChildKernel = { port: number; pid: number; exited: Promise<Exit>; stop(): Promise<Exit>; ask(message: string): Promise<unknown> };

export type LaunchOptions = {
  home: string;
  fixture: 'ledger' | 'bench' | 'desk' | 'probe' | 'keeper' | 'runner' | 'notes' | 'notes-enable' | 'notes-shared' | 'first-run' | 'presets';
  faults?: string;
  builtin?: string;
  environment?: NodeJS.ProcessEnv;
  // Extra Node flags, such as --expose-gc.
  execArgv?: string[];
};

const entry = fileURLToPath(new URL('./child-kernel.ts', import.meta.url));

export function temporaryHome(parent = tmpdir()): string {
  mkdirSync(parent, { recursive: true });
  return join(mkdtempSync(join(parent, 'kvman-child-')), 'home');
}

function forkKernel(options: LaunchOptions): { child: ChildProcess; exited: Promise<Exit> } {
  const { KVMAN_FAULTS: _inherited, ...environment } = process.env;
  const builtin = options.builtin === undefined ? [] : ['--builtin', options.builtin];
  const child = fork(entry, ['--home', options.home, '--fixture', options.fixture, ...builtin], {
    execArgv: ['--conditions=@kvman/source', ...(options.execArgv ?? [])], stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    env: { ...environment, ...options.environment, ...(options.faults === undefined ? {} : { KVMAN_FAULTS: options.faults }) },
  });
  const exited = new Promise<Exit>((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  return { child, exited };
}

// Starts a fixture kernel process and resolves once it reports; a kernel killed at a fault point shows it in `exited`.
export function launchKernel(options: LaunchOptions): Promise<ChildKernel> {
  const { child, exited } = forkKernel(options);
  return new Promise((resolve, reject) => {
    child.once('message', (message) => {
      const report = daemonStartReportSchema.parse(message);
      if (!report.ok) {
        reject(new Error(`the fixture kernel did not start: ${report.problem.code} ${report.problem.detail ?? ''}`));
        return;
      }
      resolve({
        port: report.port, pid: child.pid ?? 0, exited,
        ask: (question) => new Promise((answered) => {
          child.once('message', answered);
          child.send(question);
        }),
        stop: () => {
          child.kill('SIGTERM');
          return exited;
        },
      });
    });
    void exited.then((exit) => reject(new Error(`the fixture kernel exited before it reported: ${JSON.stringify(exit)}`)));
  });
}

// A kernel that dies at a fault point while it boots (recovery redelivers at once) may never report; its exit is all.
export function bootUntilExit(options: LaunchOptions): Promise<Exit> {
  return forkKernel(options).exited;
}
