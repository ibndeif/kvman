import path from 'node:path';
import { destination as fileDestination } from 'pino';
import type { KernelLogger, LogLevel } from './logger.ts';
import { createKernelLogger } from './logger.ts';
import { terminalDestination } from './terminal-lines.ts';

// `logs/kvman.log` (plan 01 §1.3). The main thread and each worker append to it through their own synchronous
// destination, so a line is written whole before the call returns. A kvman run also shows each record in the terminal
// (ADR 0009, 49).

export type LogFile = { logger: KernelLogger; close(): void };

export function openLogFile(home: string, level: LogLevel, terminal: boolean): LogFile {
  const destination = fileDestination({ dest: path.join(home, 'logs', 'kvman.log'), mkdir: true, sync: true, append: true });
  return {
    logger: createKernelLogger(terminal ? [destination, terminalDestination] : [destination], level),
    close: () => destination.end(),
  };
}
