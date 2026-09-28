import type { StreamSink } from '@kvman/kernel';

// One recorded Server-Sent Events message: its event name plus its parsed data.
export type RecordedMessage = { event: string; data: unknown };

// A StreamSink that records every message the EventHub sends to one stream. Frames are parsed as they complete, so
// partial chunks never lose a message.
export class RecordingSink implements StreamSink {
  readonly messages: RecordedMessage[] = [];
  #buffer = '';
  #ended = false;

  get writableLength(): number {
    return 0;
  }

  get ended(): boolean {
    return this.#ended;
  }

  write(chunk: string): boolean {
    this.#buffer += chunk;
    this.#drain();
    return true;
  }

  end(): void {
    this.#ended = true;
  }

  #drain(): void {
    while (true) {
      const boundary = this.#buffer.indexOf('\n\n');
      if (boundary === -1) return;
      const frame = this.#buffer.slice(0, boundary);
      this.#buffer = this.#buffer.slice(boundary + 2);
      const recorded = recordedOf(frame);
      if (recorded !== undefined) this.messages.push(recorded);
    }
  }
}

function recordedOf(frame: string): RecordedMessage | undefined {
  let event: string | undefined;
  let data: string | undefined;
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice('event: '.length);
    else if (line.startsWith('data: ')) data = line.slice('data: '.length);
  }
  if (event === undefined || data === undefined) return undefined;
  const parsed: unknown = JSON.parse(data);
  return { event, data: parsed };
}
