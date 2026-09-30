import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import path from 'node:path';
import { kernelProblem } from '../problems.ts';

// A long-lived process's output (plan 02 §2.16, ADR 0009, 27 and 30): `logs/processes/<extension>/<workspaceId>/<name>.log`,
// truncated at each start and capped at 10 MB, where going over drops the oldest half.

export const processLogLimitBytes = 10 * 1024 * 1024;

export const defaultTailLines = 100;

export function processLogPath(home: string, extension: string, workspaceId: string, name: string): string {
  return path.join(home, 'logs', 'processes', extension, workspaceId, `${name}.log`);
}

export type ProcessLog = { write(chunk: Buffer): void; close(): void };

export function openProcessLog(file: string): ProcessLog {
  mkdirSync(path.dirname(file), { recursive: true });
  let descriptor = openSync(file, 'w');
  let size = 0;
  const dropOldestHalf = (): void => {
    closeSync(descriptor);
    const kept = readFileSync(file).subarray(size - Math.floor(processLogLimitBytes / 2));
    writeFileSync(file, kept);
    size = kept.byteLength;
    descriptor = openSync(file, 'a');
  };
  return {
    write(chunk) {
      writeSync(descriptor, chunk);
      size += chunk.byteLength;
      if (size > processLogLimitBytes) dropOldestHalf();
    },
    close: () => closeSync(descriptor),
  };
}

// The last lines of a process's log; a process that never ran has none (NOT_FOUND).
export function tailOf(file: string, name: string, lines: number): string {
  if (!existsSync(file)) throw kernelProblem('NOT_FOUND', `There is no process ${name}.`, { name });
  const all = readFileSync(file, 'utf8').split('\n');
  if (all.at(-1) === '') all.pop();
  return all.slice(-lines).join('\n');
}
