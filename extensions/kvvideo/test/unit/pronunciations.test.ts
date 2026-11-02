import { describe, expect, it } from 'vitest';
import { spokenOf } from '../../src/narration/pronunciations.ts';

describe('the pronunciation list (16 §16.2, ADR 0115, 15)', () => {
  it('M5.6-H9 a whole word, in any case, is said as its replacement, and each character keeps its place', () => {
    const list = [{ word: 'kvman', say: 'kay vee man' }];
    const spoken = spokenOf('Open KVMAN now.', list);
    expect(spoken.text).toBe('Open kay vee man now.');
    expect([0, 4].map((index) => spoken.spokenIndex(index, 'first'))).toEqual([0, 4]);
    for (let index = 5; index <= 9; index += 1) expect([spoken.spokenIndex(index, 'first'), spoken.spokenIndex(index, 'last')]).toEqual([5, 15]);
    expect(spoken.spokenIndex(11, 'first')).toBe(17);
    expect(spokenOf('kvmanual stays.', list).text).toBe('kvmanual stays.');
    const plain = spokenOf('No list.', []);
    expect([plain.text, plain.spokenIndex(3, 'last')]).toEqual(['No list.', 3]);
  });

  it('M5.6-E7 a word with regex characters, and a word inside a longer word', () => {
    const list = [
      { word: 'C++', say: 'C plus plus' },
      { word: 'kvman', say: 'kay vee man' },
    ];
    expect(spokenOf('Use c++ and xkvman.', list).text).toBe('Use C plus plus and xkvman.');
    expect(spokenOf('مرحبا kvman!', list).text).toBe('مرحبا kay vee man!');
  });
});
