import { describe, expect, it } from 'vitest';
import { cuesOf, waitUntilMs } from '../../src/record/narration-cues.ts';

describe("a narration's cues (16 §16.5, ADR 0115, 16 and 41)", () => {
  it('M5.5-H12 line n is heard 300 ms after its start, and the recording lasts the narration with 300 ms around it', () => {
    const cues = cuesOf({ durationMs: 4000, captions: [{ startMs: 0 }, { startMs: 1500 }, { startMs: 3000 }] });
    expect(cues).toEqual({ lineStartsMs: [300, 1800, 3300], leastLengthMs: 4600 });
    expect(waitUntilMs(1800, 500)).toBe(1300);
    expect(waitUntilMs(1800, 2500)).toBe(0);
  });
});
