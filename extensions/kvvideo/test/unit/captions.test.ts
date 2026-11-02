import { describe, expect, it } from 'vitest';
import type { Alignment } from '../../src/narration/alignment.ts';
import { captionsOf, linesOf, sentencesOf, type PlacedSentence } from '../../src/narration/captions.ts';
import { spokenOf, type Pronunciation } from '../../src/narration/pronunciations.ts';

const linesOfText = (text: string): string[] => sentencesOf(text).flatMap(linesOf);

function placed(text: string, startMs: number, durationMs: number, alignment: Alignment | null = null, pronunciations: Pronunciation[] = []): PlacedSentence {
  return { text, spoken: spokenOf(text, pronunciations), startMs, durationMs, alignment };
}

// Even character times: character i from 100·i to 100·i + 90 ms.
function evenAlignment(spoken: string): Alignment {
  const count = [...spoken].length;
  return { startsMs: Array.from({ length: count }, (_, index) => index * 100), endsMs: Array.from({ length: count }, (_, index) => index * 100 + 90) };
}

describe('sentences and lines (16 §16.6, ADR 0107, 7)', () => {
  it('M5.3-H5 long sentences, line breaks, Arabic, ellipses, and white space', () => {
    const sixty = 'Every note you write is saved as you type, even offline here.';
    expect(linesOfText(sixty)).toEqual(['Every note you write is saved as you type,', 'even offline here.']);
    expect(sentencesOf('First part\nsecond part.')).toEqual(['First part', 'second part.']);
    expect(sentencesOf('هل تريد حفظ الملاحظة؟ اضغط حفظ.')).toEqual(['هل تريد حفظ الملاحظة؟', 'اضغط حفظ.']);
    expect(sentencesOf('Wait… now go.')).toEqual(['Wait…', 'now go.']);
    expect(sentencesOf('  Too \t many   spaces.  ')).toEqual(['Too many spaces.']);
    const long = 'x'.repeat(50);
    expect(linesOfText(`a ${long} b`)).toEqual(['a', long, 'b']);
    expect(sentencesOf('\n\nOne.\n\n')).toEqual(['One.']);
    expect(sentencesOf('   ')).toEqual([]);
  });
});

describe("a narration's captions (16 §16.6, ADR 0115, 17)", () => {
  it('M5.6-H8 each sentence shares its own length among its lines, and lines follow each other', () => {
    const captions = captionsOf([placed('Open the app.', 0, 2000), placed('abc.', 2250, 1000)], 3250);
    expect(captions).toEqual([
      { text: 'Open the app.', startMs: 0, endMs: 2250 },
      { text: 'abc.', startMs: 2250, endMs: 3250 },
    ]);
    const twoLines = 'Every note you write is saved as you type, even offline here.';
    const shared = captionsOf([placed(twoLines, 0, 6000), placed('Done.', 6250, 1000)], 7250);
    expect(shared.map(({ text, startMs, endMs }) => [text, startMs, endMs])).toEqual([
      ['Every note you write is saved as you type,', 0, Math.floor((6000 * 42) / 60)],
      ['even offline here.', Math.floor((6000 * 42) / 60), 6250],
      ['Done.', 6250, 7250],
    ]);
    expect(shared.every((caption) => caption.words === undefined)).toBe(true);
  });

  it('M5.6-H7 lines and words take their times from the characters', () => {
    const text = 'Every note you write is saved as you type, even offline here.';
    const sentence = placed(text, 1000, 6200, evenAlignment(text));
    const [first, second] = captionsOf([sentence], 8000);
    expect(first).toMatchObject({ text: 'Every note you write is saved as you type,', startMs: 1000, endMs: 1000 + 43 * 100 });
    expect(first?.words?.slice(0, 2)).toEqual([
      { text: 'Every', startMs: 1000, endMs: 1000 + 4 * 100 + 90 },
      { text: 'note', startMs: 1000 + 6 * 100, endMs: 1000 + 9 * 100 + 90 },
    ]);
    expect(second).toMatchObject({ text: 'even offline here.', startMs: 1000 + 43 * 100, endMs: 8000 });
    expect(second?.words?.at(-1)).toEqual({ text: 'here.', startMs: 1000 + 56 * 100, endMs: 1000 + 60 * 100 + 90 });
  });

  it('M5.6-H9 a pronounced word keeps its text in the caption and takes the time of what was said', () => {
    const pronunciations = [{ word: 'kvman', say: 'kay vee man' }];
    const text = 'Open KVMAN now.';
    const spoken = spokenOf(text, pronunciations).text;
    const [line] = captionsOf([placed(text, 0, 2000, evenAlignment(spoken), pronunciations)], 2000);
    expect(line?.text).toBe('Open KVMAN now.');
    expect(line?.words?.[1]).toEqual({ text: 'KVMAN', startMs: 5 * 100, endMs: 15 * 100 + 90 });
    expect(line?.words?.[2]).toEqual({ text: 'now.', startMs: 17 * 100, endMs: 20 * 100 + 90 });
  });
});
