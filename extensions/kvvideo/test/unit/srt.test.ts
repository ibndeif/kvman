import { describe, expect, it } from 'vitest';
import { srtFile } from '../../src/compose/srt.ts';

describe('the .srt beside a video (16 §16.8, ADR 0115, 18)', () => {
  it('M5.8-H9 numbered cues on the video time line', () => {
    expect(srtFile([{ text: 'Open  the app.', startMs: 300, endMs: 2100 }, { text: 'مرحبا', startMs: 2800, endMs: 3_725_678 }])).toBe('1\n00:00:00,300 --> 00:00:02,100\nOpen the app.\n\n2\n00:00:02,800 --> 01:02:05,678\nمرحبا\n');
  });
});
