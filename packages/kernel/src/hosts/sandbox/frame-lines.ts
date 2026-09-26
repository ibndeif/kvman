// JSON-lines framing on a sandboxed host's pipe (ADR 0129): chunks are collected until a newline ends a frame.
export class FrameLines {
  readonly #chunks: Buffer[] = [];

  // The complete lines the chunk ends, as text.
  push(chunk: Buffer): string[] {
    const lines: string[] = [];
    let start = 0;
    for (let newline = chunk.indexOf(0x0a); newline !== -1; newline = chunk.indexOf(0x0a, start)) {
      this.#chunks.push(chunk.subarray(start, newline));
      lines.push(Buffer.concat(this.#chunks).toString('utf8'));
      this.#chunks.length = 0;
      start = newline + 1;
    }
    if (start < chunk.length) this.#chunks.push(chunk.subarray(start));
    return lines;
  }
}
