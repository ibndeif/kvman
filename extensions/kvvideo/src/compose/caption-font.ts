import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bundledFonts, fontsFolder } from '../fonts/bundled-fonts.ts';
import { fontFamily } from '../fonts/font-family.ts';
import { inputPath } from '../files/workspace-paths.ts';
import { invalid } from '../problems.ts';

// The captions' font (plan 16 §16.7, ADR 0107, 8 and 24): a bundled one by name, a .ttf or .otf of the workspace by
// its own family, or, when none is named, IBM Plex Sans Arabic for captions with an Arabic letter and Poppins for
// others.

export type CaptionFont = { family: string; file: string };

const arabicLetter = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u;

function bundled(name: string): CaptionFont | undefined {
  const font = bundledFonts.find((candidate) => candidate.name === name);
  return font === undefined ? undefined : { family: font.name, file: path.join(fontsFolder, font.file) };
}

export function captionFont(root: string, named: string | undefined, texts: readonly string[]): CaptionFont {
  const name = named ?? (texts.some((text) => arabicLetter.test(text)) ? 'IBM Plex Sans Arabic' : 'Poppins');
  const font = bundled(name);
  if (font !== undefined) return font;
  if (/\.(ttf|otf)$/i.test(name)) {
    const file = inputPath(root, name, ['.ttf', '.otf']);
    return { family: fontFamily(readFileSync(file), name), file };
  }
  throw invalid(`There is no bundled font ${name}. The bundled fonts are ${bundledFonts.map((candidate) => candidate.name).join(', ')}; or name a .ttf or .otf file in the workspace.`, { font: name, fonts: bundledFonts.map((candidate) => candidate.name) });
}
