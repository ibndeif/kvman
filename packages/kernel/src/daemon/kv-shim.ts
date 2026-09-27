import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { binFolderOf } from './home-paths.ts';

// The shim module the running kernel ships: built JavaScript, or its TypeScript source when run from sources.
export function kvMainUrl(): string {
  const extension = extname(fileURLToPath(import.meta.url));
  return new URL(`../kv/kv-main${extension}`, import.meta.url).href;
}

// 12 §12.6, ADR 0141: at every start <home>/bin/kv is rewritten: its shebang is the Node running this kernel, and its
// only line imports the kernel's shim module, which uses Node built-ins alone. The file is replaced atomically.
export function writeKvShim(home: string): string {
  const folder = binFolderOf(home);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = join(folder, 'kv');
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `#!${process.execPath}\nimport(${JSON.stringify(kvMainUrl())});\n`, { mode: 0o755 });
  chmodSync(temporary, 0o755);
  renameSync(temporary, file);
  return file;
}
