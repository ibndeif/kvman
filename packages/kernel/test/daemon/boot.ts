import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUlidGenerator, Kernel, type LogRecord } from '../../src/index.ts';

export const ids = createUlidGenerator(Date.now);

export function temporaryFolder(): string {
  return mkdtempSync(join(tmpdir(), 'kvman-daemon-'));
}

// A kernel with only its own types, as a daemon runs before M2.2 installs extensions (ADR 0089).
export function bootEmptyKernel(home: string, logged: LogRecord[] = []): Promise<Kernel> {
  return Kernel.boot({
    home, extensions: { extensions: [], enabled: new Map() }, grants: { capabilities: () => undefined },
    modules: { entry: (extension) => { throw new Error(`no module for ${extension}`); } }, poolSize: 1, ids, now: Date.now,
    timers: { set: (delayMs, fire) => { const timer = setTimeout(fire, delayMs); return { cancel: () => clearTimeout(timer) }; } },
    openLogger: () => ({ write: (record) => logged.push(record), close: () => undefined }), defaultLocale: () => 'en',
  });
}
