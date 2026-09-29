import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));

// Each fenced ts block of the guide: its first line names the example file it quotes.
function codeBlocks(markdown: string): Array<{ source: string; lines: string[] }> {
  return [...markdown.matchAll(/```ts\n([\s\S]*?)```/g)].map((match) => {
    const [first = '', ...lines] = (match[1] ?? '').replace(/\n$/, '').split('\n');
    return { source: first.replace(/^\/\/ /, ''), lines };
  });
}

describe('the extension guide quotes running examples (14 §14.5, ADR 0168)', () => {
  it('M2.13-H3 every ts block of the guide is a verbatim part of a file under examples/', () => {
    const blocks = codeBlocks(readFileSync(`${root}docs/extension-guide.md`, 'utf8'));
    expect(blocks.length).toBeGreaterThan(5);
    for (const block of blocks) {
      expect(block.source).toMatch(/^examples\/[a-z0-9-]+\/.+\.ts$/);
      expect(existsSync(`${root}${block.source}`), block.source).toBe(true);
      expect(readFileSync(`${root}${block.source}`, 'utf8'), block.source).toContain(block.lines.join('\n'));
    }
  });
});
