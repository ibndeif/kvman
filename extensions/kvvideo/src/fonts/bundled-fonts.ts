import { fileURLToPath } from 'node:url';

// The bundled caption fonts (plan 16 §16.4, ADR 0107, 24): bold weights under the SIL Open Font License, in `fonts/`.

export type FontScript = 'latin' | 'arabic';

export type BundledFont = { name: string; file: string; scripts: FontScript[] };

export const bundledFonts: readonly BundledFont[] = [
  { name: 'Amiri', file: 'Amiri-Bold.ttf', scripts: ['arabic', 'latin'] },
  { name: 'IBM Plex Sans Arabic', file: 'IBMPlexSansArabic-Bold.ttf', scripts: ['arabic', 'latin'] },
  { name: 'Lato', file: 'Lato-Bold.ttf', scripts: ['latin'] },
  { name: 'Poppins', file: 'Poppins-Bold.ttf', scripts: ['latin'] },
  { name: 'Tajawal', file: 'Tajawal-Bold.ttf', scripts: ['arabic', 'latin'] },
];

/** The folder that holds the bundled fonts, from the source and the build alike. */
export const fontsFolder = fileURLToPath(new URL('../../fonts/', import.meta.url));
