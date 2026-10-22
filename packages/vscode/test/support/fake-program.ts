import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';

// A `kvman` program for the process tests: a script in a temporary folder that runs the fake kvman in a mode.

const fixture = fileURLToPath(new URL('../fixtures/fake-kvman.mjs', import.meta.url));
const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

export type FakeProgram = { program: string; folder: string; recorded(): string[] };

export function fakeProgram(mode: string): FakeProgram {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvman-vscode-'));
  folders.push(folder);
  const record = path.join(folder, 'record.txt');
  const windows = process.platform === 'win32';
  const program = path.join(folder, windows ? 'kvman.cmd' : 'kvman');
  const script = windows ? `@"${process.execPath}" "${fixture}" ${mode} "${record}" %*\r\n` : `#!/bin/sh\nexec "${process.execPath}" "${fixture}" ${mode} "${record}" "$@"\n`;
  writeFileSync(program, script);
  chmodSync(program, 0o755);
  return { program, folder, recorded: () => (existsSync(record) ? readFileSync(record, 'utf8').trim().split('\n') : []) };
}
