import { createKernelLogger, type KernelLogger } from '../src/logging/logger.ts';

export type CapturedLog = { logger: KernelLogger; lines: string[] };

export function captureLog(): CapturedLog {
  const lines: string[] = [];
  return { logger: createKernelLogger([{ write: (line: string) => lines.push(line) }], 'debug'), lines };
}
