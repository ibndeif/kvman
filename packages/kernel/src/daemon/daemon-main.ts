import { availableParallelism } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { DaemonStartReport, Problem } from '@kvman/protocol';
import { faultPointsOf } from '../faults/fault-points.ts';
import { kernelProblem, ProblemError } from '../problems.ts';
import { systemTimers } from '../scheduler/timers.ts';
import { createUlidGenerator } from '../ulid.ts';
import { Kernel, type DaemonLogger } from './kernel-daemon.ts';
import { npmRegistryFrom } from './npm-registry.ts';
import { RotatingLogFile } from './log-file.ts';
import { pinoKernelLogger, teeDestination } from './pino-logger.ts';

// The daemon process that `kvman start` spawns (ADR 0087): it boots the kernel, reports the result once to the CLI
// over the IPC channel, and shuts down on SIGTERM or SIGINT (ADR 0090).

const { values } = parseArgs({ options: { home: { type: 'string' }, port: { type: 'string' }, foreground: { type: 'boolean' } }, strict: true });

const ids = createUlidGenerator(Date.now);

function openLogger(home: string, foreground: boolean): DaemonLogger {
  const file = new RotatingLogFile({ folder: join(home, 'logs'), now: Date.now });
  const logger = pinoKernelLogger(foreground ? teeDestination(file, process.stdout) : file);
  return { write: (record) => logger.write(record), close: () => file.close() };
}

function report(result: DaemonStartReport): void {
  if (process.send === undefined) return;
  process.send(result, () => process.disconnect());
}

function problemOf(error: unknown): Problem {
  if (error instanceof ProblemError) return error.problem;
  return kernelProblem('INTERNAL', { correlationId: ids.next(), detail: 'the kernel could not start; see logs/kernel.log' });
}

function refuseArguments(detail: string): void {
  process.exitCode = 1;
  report({ ok: false, problem: kernelProblem('VALIDATION_FAILED', { correlationId: ids.next(), detail }) });
}

async function main(): Promise<void> {
  const { home, port, foreground } = values;
  if (home === undefined || !isAbsolute(home)) return refuseArguments('--home must be an absolute path');
  if (port !== undefined && !/^\d{1,5}$/.test(port)) return refuseArguments('--port must be a port number');
  try {
    const faults = faultPointsOf(process.env['KVMAN_FAULTS'], ids.next());
    const kernel = await Kernel.boot({
      home, ...(port === undefined ? {} : { port: Number(port) }), enabled: new Map(), grants: { capabilities: () => undefined },
      npmRegistry: npmRegistryFrom(process.env), environment: process.env,
      poolSize: Math.max(1, Math.min(4, availableParallelism() - 1)), ids, now: Date.now, timers: systemTimers,
      openLogger: (folder) => openLogger(folder, foreground === true), defaultLocale: () => 'en', faults,
    });
    process.on('SIGTERM', () => void kernel.shutdown());
    process.on('SIGINT', () => void kernel.shutdown());
    report({ ok: true, port: kernel.identity.port });
  } catch (error) {
    process.exitCode = 1;
    report({ ok: false, problem: problemOf(error) });
  }
}

await main();
