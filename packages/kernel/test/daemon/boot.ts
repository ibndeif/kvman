import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlidGenerator, Kernel, type LogRecord } from '../../src/index.ts';

export const ids = createUlidGenerator(Date.now);

export function temporaryFolder(): string {
  return mkdtempSync(join(tmpdir(), 'kvman-daemon-'));
}

// An empty builtin folder: the kernel installs nothing at its first run (ADR 0115).
function emptyBuiltinFolder(): string {
  const folder = join(temporaryFolder(), 'builtin');
  mkdirSync(folder);
  return folder;
}

// A kernel with only its own types: nothing installed, no builtins, and an npm registry nothing listens on.
export function bootEmptyKernel(home: string, logged: LogRecord[] = []): Promise<Kernel> {
  return Kernel.boot({
    home, builtin: emptyBuiltinFolder(), homeWorkspace: mkdtempSync(join(tmpdir(), 'kvman-home-workspace-')), npmRegistry: 'http://127.0.0.1:9/',
    environment: {}, poolSize: 1, ids, now: Date.now,
    timers: { set: (delayMs, fire) => { const timer = setTimeout(fire, delayMs); return { cancel: () => clearTimeout(timer) }; } },
    openLogger: () => ({ write: (record) => logged.push(record), close: () => undefined }),
  });
}
