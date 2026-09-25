import { closeSync, fstatSync, mkdirSync, openSync, readdirSync, renameSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';

export type LogFileOptions = { folder: string; now: () => number; maxBytes?: number; keep?: number };

// 13 §13.3: rotated daily and at 50 MB, 14 files kept.
export const logFileDefaults = { maxBytes: 50 * 1024 * 1024, keep: 14 } as const;

const rotatedName = /^kernel\.(\d{4}-\d{2}-\d{2})\.(\d+)\.log$/;

function dayOf(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

type Rotated = { name: string; day: string; number: number };

function rotatedFiles(folder: string): Rotated[] {
  return readdirSync(folder).flatMap((name) => {
    const match = rotatedName.exec(name);
    return match?.[1] === undefined || match[2] === undefined ? [] : [{ name, day: match[1], number: Number(match[2]) }];
  });
}

function newestFirst(left: Rotated, right: Rotated): number {
  return left.day === right.day ? right.number - left.number : right.day.localeCompare(left.day);
}

// ADR 0093: logs/kernel.log, renamed to kernel.<day>.<n>.log when the day changes or the next line would pass the size
// limit; only the newest rotated files are kept. Lines are written synchronously, so nothing is lost at exit.
export class RotatingLogFile {
  readonly #folder: string;
  readonly #now: () => number;
  readonly #maxBytes: number;
  readonly #keep: number;
  #descriptor: number;
  #size: number;
  #day: string;

  constructor(options: LogFileOptions) {
    this.#folder = options.folder;
    this.#now = options.now;
    this.#maxBytes = options.maxBytes ?? logFileDefaults.maxBytes;
    this.#keep = options.keep ?? logFileDefaults.keep;
    mkdirSync(this.#folder, { recursive: true, mode: 0o700 });
    this.#descriptor = openSync(this.#current(), 'a', 0o600);
    const stats = fstatSync(this.#descriptor);
    this.#size = stats.size;
    this.#day = dayOf(stats.size > 0 ? stats.mtimeMs : this.#now());
  }

  write(line: string): void {
    const bytes = Buffer.byteLength(line);
    const today = dayOf(this.#now());
    if (this.#size > 0 && (today !== this.#day || this.#size + bytes > this.#maxBytes)) this.#rotate();
    this.#day = today;
    writeSync(this.#descriptor, line);
    this.#size += bytes;
  }

  close(): void {
    closeSync(this.#descriptor);
  }

  #current(): string {
    return join(this.#folder, 'kernel.log');
  }

  #rotate(): void {
    closeSync(this.#descriptor);
    const taken = rotatedFiles(this.#folder).filter((file) => file.day === this.#day).map((file) => file.number);
    renameSync(this.#current(), join(this.#folder, `kernel.${this.#day}.${Math.max(0, ...taken) + 1}.log`));
    for (const old of rotatedFiles(this.#folder).sort(newestFirst).slice(this.#keep)) rmSync(join(this.#folder, old.name));
    this.#descriptor = openSync(this.#current(), 'a', 0o600);
    this.#size = 0;
  }
}
