import type { SseMessage, SseMessageName } from '@kvman/protocol';

// The part of a response an event stream writes to.
export type StreamSink = { readonly writableLength: number; write(chunk: string): boolean; end(): void };

// 12 §12.3: each stream has a 1 MB send buffer.
export const sendBufferLimit = 1024 * 1024;

export const reconnectDelayMs = 1000;

type SendOptions = { id?: number };

// One Server-Sent Events response (12 §12.3). Over the send buffer, live messages are dropped first (the client sees
// the gap in n and refetches); any other message then closes the stream as a slow consumer, and the client
// reconnects with its cursor.
export class StreamWriter {
  readonly #sink: StreamSink;
  #open = true;

  constructor(sink: StreamSink) {
    this.#sink = sink;
    this.#sink.write(`retry: ${reconnectDelayMs}\n\n`);
  }

  get open(): boolean {
    return this.#open;
  }

  send<Name extends SseMessageName>(name: Name, data: SseMessage<Name>, options: SendOptions = {}): void {
    if (!this.#open) return;
    if (this.#sink.writableLength > sendBufferLimit) {
      if (name !== 'live') this.close('slow-consumer');
      return;
    }
    this.#write(name, data, options);
  }

  comment(text: string): void {
    if (this.#open && this.#sink.writableLength <= sendBufferLimit) this.#sink.write(`: ${text}\n\n`);
  }

  close(reason: SseMessage<'close'>['reason']): void {
    if (!this.#open) return;
    this.#write('close', { reason }, {});
    this.end();
  }

  // Ends the response without a message: another connection took over the stream (ADR 0098), or the client left.
  end(): void {
    if (!this.#open) return;
    this.#open = false;
    this.#sink.end();
  }

  #write(name: SseMessageName, data: unknown, { id }: SendOptions): void {
    const idLine = id === undefined ? '' : `id: ${id}\n`;
    this.#sink.write(`event: ${name}\n${idLine}data: ${JSON.stringify(data)}\n\n`);
  }
}
