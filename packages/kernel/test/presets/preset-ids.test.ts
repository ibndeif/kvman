import { describe, expect, it } from 'vitest';
import { presetIdFor } from '../../src/index.ts';

describe('preset save-as ids (ADR 0149)', () => {
  it('M2.8-E1 save-as derives the catalog id from the name', () => {
    const free = (): boolean => false;
    expect(presetIdFor('PDF Translator', free)).toBe('pdf-translator');
    expect(presetIdFor('  Hello, World!  ', free)).toBe('hello-world');
    expect(presetIdFor('مترجم', free)).toBe('preset');
    expect(presetIdFor('a'.repeat(70), free)).toBe('a'.repeat(64));
    const taken = (id: string): boolean => id === 'pdf-translator' || id === 'pdf-translator-2';
    expect(presetIdFor('pdf-translator', taken)).toBe('pdf-translator-3');
    const longTaken = (id: string): boolean => id === 'a'.repeat(64);
    expect(presetIdFor('a'.repeat(64), longTaken)).toBe(`${'a'.repeat(62)}-2`);
  });
});
