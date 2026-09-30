import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import type { ProcessInfo, Workspace } from '@kvman/sdk';
import { isoTime, type Clock } from '../clock.ts';
import type { Deliver } from '../jobs/dispatcher.ts';
import type { KernelLogger } from '../logging/logger.ts';
import { kernelProblem } from '../problems.ts';
import type { Connection } from '../storage/database.ts';
import { carryOut, isAlive, killPlan, spawnOptionsFor, type StopSignal } from './process-kill.ts';
import { openProcessLog, processLogPath } from './process-log.ts';
import { deleteProcess, insertProcess, listProcesses, type ProcessRow } from './process-rows.ts';

// The main thread's long-lived processes (plan 02 §2.16). They outlive jobs and hot reloads, so they belong to the
// main thread, not to a worker. One that exits by itself triggers `kernel.process.exited`.

export const stopGraceMs = 5000;

export type ProcessStartOptions = { command: string; args: readonly string[]; cwd: string | undefined; env: Readonly<Record<string, string>> };

export type ProcessServiceOptions = {
  connection: Connection;
  home: string;
  clock: Clock;
  logger: KernelLogger;
  platform: NodeJS.Platform;
  deliverAlong: (work: (deliverIn: Deliver) => void) => void;
};

type Running = { row: ProcessRow; child: ChildProcess; stopping: boolean; closed: Promise<void> };

const keyOf = (extension: string, workspaceId: string, name: string): string => JSON.stringify([extension, workspaceId, name]);

function started(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('spawn', () => (child.pid === undefined ? reject(new Error('the process has no pid')) : resolve(child.pid)));
    child.once('error', reject);
  });
}

export type ProcessService = ReturnType<typeof createProcessService>;

export function createProcessService(options: ProcessServiceOptions) {
  const { connection, platform } = options;
  const running = new Map<string, Running>();
  const starting = new Set<string>();

  const signal = (entry: Running, stopSignal: StopSignal): void => carryOut(killPlan(platform, entry.row.pid, stopSignal));

  const launch = async (workspace: Workspace, row: Omit<ProcessRow, 'pid' | 'startedAt'>, start: ProcessStartOptions): Promise<Running> => {
    const cwd = start.cwd === undefined ? workspace.path : path.resolve(workspace.path, start.cwd);
    const logFile = processLogPath(options.home, row.extension, row.workspaceId, row.name);
    const log = openProcessLog(logFile);
    const child = spawn(start.command, start.args, { cwd, env: { ...process.env, ...start.env }, stdio: ['ignore', 'pipe', 'pipe'], ...spawnOptionsFor(platform) });
    child.stdout?.on('data', (chunk: Buffer) => log.write(chunk));
    child.stderr?.on('data', (chunk: Buffer) => log.write(chunk));
    let pid: number;
    try {
      pid = await started(child);
    } catch (error) {
      log.close();
      rmSync(logFile, { force: true });
      const reason = error instanceof Error ? error.message : String(error);
      throw kernelProblem('VALIDATION_FAILED', `The process ${row.name} can't start (${reason}).`, { name: row.name });
    }
    child.on('error', (error) => options.logger.error('A long-lived process failed.', { extension: row.extension, name: row.name, error: error.message }));
    const entry: Running = { row: { ...row, pid, startedAt: isoTime(options.clock) }, child, stopping: false, closed: Promise.resolve() };
    entry.closed = new Promise((resolve) => {
      child.once('close', (exitCode: number | null, exitSignal: NodeJS.Signals | null) => {
        log.close();
        running.delete(keyOf(row.extension, row.workspaceId, row.name));
        options.deliverAlong((deliverIn) => {
          deleteProcess(connection, row);
          const exited = { extension: row.extension, workspaceId: row.workspaceId, name: row.name, exitCode, signal: exitSignal };
          if (!entry.stopping) deliverIn('kernel.process.exited', exited, row.workspaceId);
        });
        resolve();
      });
    });
    return entry;
  };

  return {
    async start(extension: string, workspace: Workspace, name: string, start: ProcessStartOptions): Promise<ProcessInfo> {
      const key = keyOf(extension, workspace.id, name);
      if (running.has(key) || starting.has(key)) throw kernelProblem('PROCESS_RUNNING', `The process ${name} is already running.`, { name });
      starting.add(key);
      try {
        const entry = await launch(workspace, { extension, workspaceId: workspace.id, name }, start);
        running.set(key, entry);
        insertProcess(connection, entry.row);
        return { name, pid: entry.row.pid, startedAt: entry.row.startedAt };
      } finally {
        starting.delete(key);
      }
    },
    // Linux and macOS: SIGTERM to the group, then SIGKILL after 5 s (real time); Windows: taskkill at once.
    async stop(extension: string, workspaceId: string, name: string): Promise<void> {
      const entry = running.get(keyOf(extension, workspaceId, name));
      if (entry === undefined) throw kernelProblem('NOT_FOUND', `There is no running process ${name}.`, { name });
      entry.stopping = true;
      signal(entry, 'SIGTERM');
      const escalation = setTimeout(() => signal(entry, 'SIGKILL'), stopGraceMs);
      await entry.closed;
      clearTimeout(escalation);
    },
    // kvman's stop: every process gets SIGTERM (or taskkill); `killAll` ends the rest at the budget's end.
    terminateAll(): void {
      for (const entry of running.values()) {
        entry.stopping = true;
        signal(entry, 'SIGTERM');
      }
    },
    async killAll(): Promise<void> {
      for (const entry of running.values()) signal(entry, 'SIGKILL');
      await Promise.all([...running.values()].map((entry) => entry.closed));
    },
    exited: async (): Promise<void> => {
      await Promise.all([...running.values()].map((entry) => entry.closed));
    },
    // Processes a crashed kvman left behind (plan 02 §2.16): each still alive is killed, and every row is cleared.
    killLeftovers(): void {
      for (const row of listProcesses(connection)) {
        if (isAlive(row.pid)) carryOut(killPlan(platform, row.pid, 'SIGKILL'));
        deleteProcess(connection, row);
      }
    },
  };
}
