import { createWriteStream, type WriteStream } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { limits, processLimits, utf8ByteLength } from '@kvman/protocol';
import type { SchedulerTimers, TimerHandle } from '../scheduler/timers.ts';

export type OutputOptions = {
  logPath: string;
  capBytes: number;
  timers: SchedulerTimers;
  // Called with each coalesced piece of kept output, when the process streams live.
  live?: (text: string) => void;
  // Called once, when the output first passes the cap.
  truncated: () => void;
};

export type OutputSummary = { tail: string; truncated: boolean };

const chunkEnvelopeBytes = utf8ByteLength(JSON.stringify({ text: '' }));

function escapedBytes(character: string): number {
  return utf8ByteLength(JSON.stringify(character)) - 2;
}

// Live text split into { text } chunks within the live payload limit (02 §2.13), never inside a character.
export function liveTextPieces(text: string, maxChunkBytes: number = limits.liveChunkBytes): string[] {
  const budget = maxChunkBytes - chunkEnvelopeBytes;
  const pieces: string[] = [];
  let piece = '';
  let size = 0;
  for (const character of text) {
    const cost = escapedBytes(character);
    if (size + cost > budget && piece.length > 0) {
      pieces.push(piece);
      piece = '';
      size = 0;
    }
    piece += character;
    size += cost;
  }
  if (piece.length > 0) pieces.push(piece);
  return pieces;
}

function isContinuationByte(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

// The last `tailBytes` of the kept output, starting on a character boundary.
function tailText(bytes: Buffer): string {
  let start = 0;
  while (start < bytes.length && isContinuationByte(bytes[start] ?? 0)) start += 1;
  return bytes.subarray(start).toString('utf8');
}

export function truncationMarker(capBytes: number): string {
  return `\n[kvman: output truncated at ${capBytes} bytes]\n`;
}

// 03 §3.7, ADR 0139: a process's joined output. It goes to its log file up to the cap, then the marker, and the rest is
// read and dropped, so the process never blocks. The last 4 KB kept are its tail, and kept output streams live in
// pieces coalesced over 100 ms.
export class ProcessOutput {
  readonly #options: OutputOptions;
  readonly #file: WriteStream;
  readonly #decoder = new StringDecoder('utf8');
  readonly #closed: Promise<void>;
  #tail = Buffer.alloc(0);
  #kept = 0;
  #truncated = false;
  #pending = '';
  #flush: TimerHandle | undefined;
  failure: Error | undefined;

  constructor(options: OutputOptions) {
    this.#options = options;
    this.#file = createWriteStream(options.logPath, { flags: 'wx', mode: 0o600 });
    this.#file.on('error', (error) => {
      this.failure = error;
    });
    this.#closed = new Promise((resolve) => this.#file.once('close', () => resolve()));
  }

  write(chunk: Buffer): void {
    if (this.#truncated) return;
    const room = this.#options.capBytes - this.#kept;
    const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
    this.#keep(kept);
    if (chunk.length > room) this.#truncate();
  }

  // The output pipe closed: what is pending streams at once, and the log file is closed.
  async finish(): Promise<OutputSummary> {
    this.#flush?.cancel();
    this.#pending += this.#decoder.end();
    this.#stream();
    this.#file.end();
    await this.#closed;
    return { tail: tailText(this.#tail), truncated: this.#truncated };
  }

  #keep(bytes: Buffer): void {
    if (bytes.length === 0) return;
    this.#kept += bytes.length;
    this.#file.write(bytes);
    const joined = Buffer.concat([this.#tail, bytes]);
    this.#tail = joined.subarray(Math.max(0, joined.length - processLimits.tailBytes));
    if (this.#options.live === undefined) return;
    this.#pending += this.#decoder.write(bytes);
    this.#flush ??= this.#options.timers.set(processLimits.liveWindowMs, () => {
      this.#flush = undefined;
      this.#stream();
    });
  }

  #truncate(): void {
    this.#truncated = true;
    this.#file.write(truncationMarker(this.#options.capBytes));
    this.#options.truncated();
  }

  #stream(): void {
    const { live } = this.#options;
    if (live === undefined || this.#pending.length === 0) return;
    const text = this.#pending;
    this.#pending = '';
    for (const piece of liveTextPieces(text)) live(piece);
  }
}
