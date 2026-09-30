import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const web = fileURLToPath(new URL('../web/src', import.meta.url));

function files(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const file = path.join(folder, name);
    return statSync(file).isDirectory() ? files(file) : /\.(ts|vue|css)$/.test(name) ? [file] : [];
  });
}

// Physical Tailwind classes and CSS properties: the inline direction must follow the language (CLAUDE.md §5).
const physicalClasses = /(?<![\w-])(?:-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|scroll-ml|scroll-mr)-[\w./[\]-]+|text-left|text-right|float-left|float-right|clear-left|clear-right)(?![\w-])/;
const physicalProperties = /(?:margin|padding|border)-(?:left|right)\s*:|(?<![\w-])(?:left|right)\s*:|text-align\s*:\s*(?:left|right)/;

describe("kvwebui's sources (06 §6.1)", () => {
  it('M2.2-E18 styles are logical only, and v-html appears only in the Markdown component', () => {
    const found = files(web).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n').map((line, index) => ({ line, at: `${path.relative(web, file)}:${String(index + 1)}` }));
      return lines.filter(({ line }) => physicalClasses.test(line) || physicalProperties.test(line)).map(({ at, line }) => `${at} ${line.trim()}`);
    });
    expect(found).toEqual([]);
    const withHtml = files(web).filter((file) => readFileSync(file, 'utf8').includes('v-html'));
    expect(withHtml.map((file) => path.relative(web, file))).toEqual([path.join('components', 'views', 'MarkdownView.vue')]);
  });
});
