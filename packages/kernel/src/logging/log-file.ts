import path from 'node:path';
import { destination as fileDestination } from 'pino';
import type { KernelLogger, LogLevel } from './logger.ts';
import { createKernelLogger } from './logger.ts';

// `logs/kvman.log` (plan 01 §1.3). The main thread and each worker append to it through their own synchronous
// destination, so a line is written whole before the call returns.

export type LogFile = { logger: KernelLogger; close(): void };

export function openLogFile(home: string, level: LogLevel): LogFile {
  const destination = fileDestination({ dest: path.join(home, 'logs', 'kvman.log'), mkdir: true, sync: true, append: true });
  return {
    logger: createKernelLogger(destination, level),
    close: () => destination.end(),
  };
}
