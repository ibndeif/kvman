import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { captionFont } from '../../src/compose/caption-font.ts';
import { fontsFolder } from '../../src/fonts/bundled-fonts.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'kvvideo-fonts-'));
  roots.push(root);
  return root;
}

const problemOf = (run: () => unknown): unknown => {
  try {
    run();
    return undefined;
  } catch (error) {
    return error instanceof ProblemError ? error.problem : error;
  }
};

describe("the captions' font (16 §16.7, ADR 0107, 8 and 24)", () => {
  it('M5.4-H5 by script when none is named, a bundled one by name, and a workspace file by its family', () => {
    const root = workspace();
    expect(captionFont(root, undefined, ['Hello', 'مرحبا'])).toEqual({ family: 'IBM Plex Sans Arabic', file: path.join(fontsFolder, 'IBMPlexSansArabic-Bold.ttf') });
    expect(captionFont(root, undefined, ['Hello'])).toEqual({ family: 'Poppins', file: path.join(fontsFolder, 'Poppins-Bold.ttf') });
    expect(captionFont(root, 'Amiri', ['Hello']).family).toBe('Amiri');
    copyFileSync(path.join(fontsFolder, 'Lato-Bold.ttf'), path.join(root, 'brand.TTF'));
    expect(captionFont(root, 'brand.TTF', ['x'])).toEqual({ family: 'Lato', file: path.join(root, 'brand.TTF') });
  });

  it('M5.4-E4 an unknown name lists the bundled fonts; a missing file is NOT_FOUND; a bad file VALIDATION_FAILED', () => {
    const root = workspace();
    expect(problemOf(() => captionFont(root, 'Comic Sans', ['x']))).toMatchObject({ code: 'VALIDATION_FAILED', params: { font: 'Comic Sans', fonts: ['Amiri', 'IBM Plex Sans Arabic', 'Lato', 'Poppins'] } });
    expect(problemOf(() => captionFont(root, 'fonts/x.ttf', ['x']))).toMatchObject({ code: 'NOT_FOUND' });
    writeFileSync(path.join(root, 'bad.otf'), 'not a font');
    expect(problemOf(() => captionFont(root, 'bad.otf', ['x']))).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
