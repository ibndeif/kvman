import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { useKvwebuiKernel } from './support/kvwebui-kernel.ts';

const kvwebui = useKvwebuiKernel();
const docsFolder = fileURLToPath(new URL('../docs/', import.meta.url));
const topics = ['components', 'views'];
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });

const titleOf = (markdown: string) => (markdown.split('\n').find((line) => line.startsWith('# ')) ?? '').slice(2);

describe('kvwebui documents itself (06 §6.9, 09 §9.5, ADR 0010, 15 and 16)', () => {
  it('QA17-H25 docs.list answers views and components, docs.get their files, both public, and bad topics are NOT_FOUND', async () => {
    const kernel = await kvwebui.start([]);
    expect(await kernel.exec('kvwebui.docs.list', {})).toEqual(
      topics.map((topic) => ({ topic, title: titleOf(readFileSync(path.join(docsFolder, `${topic}.md`), 'utf8')) })),
    );
    for (const topic of topics) {
      const markdown = readFileSync(path.join(docsFolder, `${topic}.md`), 'utf8');
      expect(await kernel.exec('kvwebui.docs.get', { topic })).toEqual({ topic, title: titleOf(markdown), markdown });
    }
    const info = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvwebui');
    for (const name of ['kvwebui.docs.list', 'kvwebui.docs.get']) expect(info?.queries.find((query) => query.name === name)?.public, name).toBe(true);
    for (const topic of ['unknown', '../x', 'Bad_Topic', '']) await expect(kernel.exec('kvwebui.docs.get', { topic }), topic).rejects.toEqual(failed('NOT_FOUND'));
  });

  it('QA17-H25 every relative link in the pages resolves, and no page names the old extension or a dev preset', () => {
    for (const file of readdirSync(docsFolder).filter((name) => name.endsWith('.md'))) {
      const markdown = readFileSync(path.join(docsFolder, file), 'utf8');
      for (const match of markdown.matchAll(/\]\((?!https?:|mailto:|#)([^)#\s]+)/g)) {
        expect(existsSync(path.join(docsFolder, match[1] ?? '')), `${file} links to ${match[1] ?? ''}`).toBe(true);
      }
      expect(markdown, file).not.toMatch(new RegExp('kv' + 'dev', 'i'));
      expect(markdown, file).not.toMatch(/\bdev[ -]preset/i);
    }
  });
});
