import { describe, expect, it } from 'vitest';
import { captionLines, timedCaptions } from '../../src/narration/captions.ts';

describe('captions in proportion (16 §16.6, ADR 0107, 7)', () => {
  it('M5.3-H4 two sentences share the length by their characters', () => {
    expect(timedCaptions('Open the app. Then sign in.', 2600)).toEqual([
      { text: 'Open the app.', startMs: 0, endMs: 1300 },
      { text: 'Then sign in.', startMs: 1300, endMs: 2600 },
    ]);
  });

  it('M5.3-H5 long sentences, line breaks, Arabic, ellipses, and white space', () => {
    const sixty = 'Every note you write is saved as you type, even offline here.';
    expect(captionLines(sixty)).toEqual(['Every note you write is saved as you type,', 'even offline here.']);
    expect(captionLines('First part\nsecond part.')).toEqual(['First part', 'second part.']);
    expect(captionLines('هل تريد حفظ الملاحظة؟ اضغط حفظ.')).toEqual(['هل تريد حفظ الملاحظة؟', 'اضغط حفظ.']);
    expect(captionLines('Wait… now go.')).toEqual(['Wait…', 'now go.']);
    expect(captionLines('  Too \t many   spaces.  ')).toEqual(['Too many spaces.']);
    const long = 'x'.repeat(50);
    expect(captionLines(`a ${long} b`)).toEqual(['a', long, 'b']);
    expect(captionLines('\n\nOne.\n\n')).toEqual(['One.']);
    const timed = timedCaptions('abc. de. f.', 1000);
    expect(timed.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
      [0, 444],
      [444, 777],
      [777, 1000],
    ]);
  });
});
