import { describe, expect, it } from 'vitest';
import { LiveBus, type LiveFrame } from '../../src/index.ts';

const address = { type: 'notes.text.streamed', key: 'a', workspaceId: undefined };
const runOne = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';
const runTwo = '01JAZ3K4M5N6P7Q8R9S0T1V2W4';

describe('the live bus (plan 02 §2.3, §2.5)', () => {
  it('M1.6-H13 a reset never removes another run\'s chunks', () => {
    const bus = new LiveBus();
    const heard: LiveFrame[] = [];
    bus.subscribe((frame) => heard.push(frame));
    bus.publish(address, runOne, { text: 'a' });
    bus.publish(address, runTwo, { text: 'x' });
    bus.publish(address, runOne, { text: 'b' });
    bus.publish(address, runTwo, { text: 'y' });
    bus.reset(runOne, [address]);

    const ring = bus.ring('notes.text.streamed', 'a');
    expect(ring.map((frame) => [frame.run, frame.chunk])).toEqual([[runTwo, { text: 'x' }], [runTwo, { text: 'y' }], [runOne, { reset: true }]]);
    expect(ring.map((frame) => frame.n)).toEqual([2, 4, 5]);
    expect(heard.map((frame) => frame.n)).toEqual([1, 2, 3, 4, 5]);
    expect(heard.at(-1)).toMatchObject({ type: 'notes.text.streamed', key: 'a', run: runOne, chunk: { reset: true } });
  });
});
