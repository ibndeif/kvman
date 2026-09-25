import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { sendBufferLimit, StreamWriter } from '../../src/index.ts';

const run = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';
const event = { sid: 'n', seq: 1, event: { id: run, type: 'notes.added', source: 'ext:@acme/notes' as const, payload: {}, correlationId: run, createdAt: 1 } };
const live = { sid: 'l', type: 'notes.text.streamed', key: 'k', run, n: 1, chunk: { text: 'x' } };

function unread(): { sink: PassThrough; text: () => string } {
  const sink = new PassThrough({ highWaterMark: 16 });
  return { sink, text: () => String(sink.read() ?? '') };
}

describe('the event stream writer (plan 12 §12.3)', () => {
  it('M1.8-E63 backpressure drops live messages first, then closes slow-consumer', () => {
    const under = unread();
    const writer = new StreamWriter(under.sink);
    writer.send('live', live);
    writer.send('event', event, { id: 1 });
    expect(under.text()).toBe(`retry: 1000\n\nevent: live\ndata: ${JSON.stringify(live)}\n\nevent: event\nid: 1\ndata: ${JSON.stringify(event)}\n\n`);

    const over = unread();
    const full = new StreamWriter(over.sink);
    over.sink.write('x'.repeat(sendBufferLimit + 1));
    const ended = new Promise((resolve) => over.sink.once('finish', resolve));
    full.send('live', live);
    expect(full.open).toBe(true);
    full.send('event', event, { id: 1 });
    expect(full.open).toBe(false);
    const text = over.text();
    expect(text).not.toContain('event: live');
    expect(text).not.toContain('event: event');
    expect(text.endsWith('event: close\ndata: {"reason":"slow-consumer"}\n\n')).toBe(true);
    return ended;
  });
});
