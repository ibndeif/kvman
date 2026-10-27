import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { runConnector } from '@kvman/kvcoder/testing';
import { bundledFonts } from '../src/fonts/bundled-fonts.ts';
import { useKvvideo } from './support/kvvideo-kernel.ts';

const kvvideo = useKvvideo();

describe('video fonts (16 §16.4, ADR 0107, 24)', { timeout: 60_000 }, () => {
  it('M5.1-H7 fonts lists the four bundled fonts with their scripts, each in the package with its licence', async () => {
    const { kernel } = await kvvideo.start();
    const result = await runConnector(kernel, { connector: 'video', command: 'fonts', payload: {} });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual([
      { name: 'Amiri', scripts: ['arabic', 'latin'] },
      { name: 'IBM Plex Sans Arabic', scripts: ['arabic', 'latin'] },
      { name: 'Lato', scripts: ['latin'] },
      { name: 'Poppins', scripts: ['latin'] },
    ]);
    for (const font of bundledFonts) {
      expect(existsSync(new URL(`../fonts/${font.file}`, import.meta.url))).toBe(true);
      expect(readFileSync(new URL(`../fonts/OFL-${font.file.replace('-Bold.ttf', '')}.txt`, import.meta.url), 'utf8')).toContain('SIL OPEN FONT LICENSE');
    }
    const manifest = z.object({ files: z.array(z.string()) }).parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));
    expect(manifest.files).toContain('fonts');
  });
});
