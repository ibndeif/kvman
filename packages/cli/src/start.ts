import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { daemonStartReportSchema, type DaemonStartReport } from '@kvman/protocol';
import { findKernel } from './kernel-client.ts';
import { printLine, printProblem } from './output.ts';

export type StartOptions = { home: string; port: number | undefined; foreground: boolean };

type Outcome = { report: DaemonStartReport } | { exitCode: number | null };

// ADR 0087: the kernel's daemon script is found by path, never imported (01 §1.5).
function daemonScript(): string {
  return fileURLToPath(import.meta.resolve('@kvman/kernel/daemon'));
}

// The daemon reports once over the IPC channel; exiting first is a failure to start.
function firstOutcome(child: ChildProcess): Promise<Outcome> {
  return new Promise((resolve) => {
    child.once('message', (message) => resolve({ report: daemonStartReportSchema.parse(message) }));
    child.once('exit', (exitCode) => resolve({ exitCode }));
  });
}

function runningLine(port: number, home: string): string {
  return `kvman is running at http://127.0.0.1:${port} (home ${home})`;
}

// 12 §12.5: in the background the CLI returns once /health answers and the daemon keeps running; with --foreground
// it stays attached until the daemon exits.
export async function start(options: StartOptions): Promise<number> {
  const { home, port, foreground } = options;
  const flags = ['--home', home, ...(port === undefined ? [] : ['--port', String(port)]), ...(foreground ? ['--foreground'] : [])];
  const child = spawn(process.execPath, [...process.execArgv, daemonScript(), ...flags], {
    detached: !foreground, stdio: foreground ? ['inherit', 'inherit', 'inherit', 'ipc'] : ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const outcome = await firstOutcome(child);
  if (!('report' in outcome)) {
    printProblem({ code: 'INTERNAL', title: 'Unexpected error', hint: `the daemon exited with code ${String(outcome.exitCode)} before it started; see logs/kernel.log` });
    return 1;
  }
  if (!outcome.report.ok) {
    printProblem(outcome.report.problem);
    return 1;
  }
  if (foreground) return attached(child, outcome.report.port, home);
  child.unref();
  const running = await findKernel(home);
  if (running === undefined) {
    printProblem({ code: 'INTERNAL', title: 'Unexpected error', hint: 'the daemon started but /health does not answer' });
    return 1;
  }
  printLine(runningLine(running.health.port, home));
  return 0;
}

// Ctrl+C reaches the daemon too, which shuts down; a SIGTERM to the CLI (a service manager) is passed on to it.
function attached(child: ChildProcess, port: number, home: string): Promise<number> {
  printLine(runningLine(port, home));
  const forward = (): void => {
    child.kill('SIGTERM');
  };
  const waitForDaemon = (): void => undefined;
  process.on('SIGTERM', forward);
  process.on('SIGINT', waitForDaemon);
  return new Promise((resolve) => {
    child.once('exit', (exitCode) => {
      process.off('SIGTERM', forward);
      process.off('SIGINT', waitForDaemon);
      resolve(exitCode ?? 1);
    });
  });
}
