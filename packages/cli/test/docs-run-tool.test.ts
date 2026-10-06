import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The documentation after the `run` tool (QA18-H24): the pages that describe the agent say how it acts now, and no page
// still shows a connector call as a shell line.

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const read = (...parts: string[]): string => readFileSync(path.join(root, ...parts), 'utf8');
const markdownIn = (...parts: string[]): string[] => readdirSync(path.join(root, ...parts)).filter((name) => name.endsWith('.md')).map((name) => path.join(...parts, name));

const pages = [...markdownIn('docs', 'developers'), ...markdownIn('docs', 'user-guide'), ...['kvcoder', 'kvbuilder', 'kvwebui', 'kvai'].flatMap((extension) => markdownIn('extensions', extension, 'docs')), ...markdownIn('packages', 'testkit', 'docs')];

describe('the documentation describes the run tool (QA18-H24, ADR 0011)', () => {
  it('QA18-H24 the pages about the agent name the run tool, help, and the background connector, and no page shows the old call forms', () => {
    for (const page of [path.join('docs', 'developers', 'connectors.md'), path.join('extensions', 'kvcoder', 'docs', 'connectors.md'), path.join('extensions', 'kvbuilder', 'docs', 'building.md')]) {
      const markdown = read(page);
      expect(markdown, page).toContain('`run`');
      expect(markdown, page).toContain('`help`');
    }
    for (const page of [path.join('docs', 'developers', 'connectors.md'), path.join('extensions', 'kvcoder', 'docs', 'connectors.md'), path.join('docs', 'user-guide', 'coding-app.md')]) expect(read(page), page).toContain('`background`');
    expect(read('docs', 'user-guide', 'coding-app.md')).toContain('connector');

    for (const [where, markdown] of pages.map((page) => [page, read(page)] as const)) {
      expect(markdown, where).not.toMatch(/--async|jobs (get|cancel)|<<'EOF'|heredoc|here-string/);
      expect(markdown, where).not.toMatch(/`[a-z-]+ (-h|[a-z-]+ -h)`/);
      expect(markdown, where).not.toMatch(/`[a-z-]+ [a-z-]+ '\{/);
    }
  });
});
