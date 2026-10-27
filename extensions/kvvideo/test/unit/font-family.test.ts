import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { bundledFonts, fontsFolder } from '../../src/fonts/bundled-fonts.ts';
import { fontFamily } from '../../src/fonts/font-family.ts';

describe("a font's family (16 §16.7)", () => {
  it("M5.4-H5 each bundled font's file names its family as kvvideo lists it", () => {
    for (const font of bundledFonts) expect(fontFamily(readFileSync(`${fontsFolder}${font.file}`), font.file)).toBe(font.name);
  });

  it("M5.4-E4 a file that isn't a font fails VALIDATION_FAILED", () => {
    for (const bytes of [Buffer.from('not a font at all'), Buffer.alloc(4), Buffer.from('ttcf0000000000000000')]) {
      let code: string | undefined;
      try {
        fontFamily(bytes, 'bad.ttf');
      } catch (error) {
        code = error instanceof ProblemError ? error.problem.code : String(error);
      }
      expect(code).toBe('VALIDATION_FAILED');
    }
  });
});
