import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { kvaiFolder, useKvai } from './support/kvai-kernel.ts';

const kvai = useKvai();

const docsFolder = path.join(kvaiFolder, 'docs');

const pageSchema = z.object({ topic: z.string(), title: z.string() });
const pageSchemaFull = pageSchema.extend({ markdown: z.string() });

function failsWith(code: string): object {
  return { problem: { code } };
}

// Every relative `](target)` link in the page.
function linksOf(markdown: string): string[] {
  return [...markdown.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1] ?? '').filter((target) => !/^(https?:|mailto:|#)/.test(target));
}

const topics = ['models', 'providers'] as const;

describe('kvai.docs (07 §7.5, 09 §9.5)', () => {
  it('QA17-H25 docs.list answers both topics sorted, docs.get answers each page, both are public, and bad topics are NOT_FOUND', async () => {
    const { kernel } = await kvai.start();
    const list = z.array(pageSchema).parse(await kernel.exec('kvai.docs.list', {}));
    expect(list.map((page) => page.topic)).toEqual([...topics]);
    for (const page of list) {
      const markdown = readFileSync(path.join(docsFolder, `${page.topic}.md`), 'utf8');
      expect(page.title).toBe(markdown.split('\n').find((line) => line.startsWith('# '))?.slice(2));
    }
    for (const topic of topics) {
      const markdown = readFileSync(path.join(docsFolder, `${topic}.md`), 'utf8');
      expect(pageSchemaFull.parse(await kernel.exec('kvai.docs.get', { topic }))).toEqual({
        topic,
        title: markdown.split('\n').find((line) => line.startsWith('# '))?.slice(2),
        markdown,
      });
    }

    // Both are public: a plain user answers them, and the kernel lists them as public.
    expect(await kernel.exec('kvai.docs.list', {})).toHaveLength(2);
    const info = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvai');
    const publicNames = [...(info?.queries ?? [])].filter((call) => call.public).map((call) => call.name);
    expect(publicNames).toContain('kvai.docs.list');
    expect(publicNames).toContain('kvai.docs.get');

    for (const bad of [`unknown`, '../x', 'Bad_Topic', '']) {
      await expect(kernel.exec('kvai.docs.get', { topic: bad })).rejects.toMatchObject(failsWith('NOT_FOUND'));
    }
  });

  it('QA17-H25 every relative link resolves, and no page mentions kvdev or a dev preset', () => {
    for (const file of readdirSync(docsFolder).filter((name) => name.endsWith('.md'))) {
      const markdown = readFileSync(path.join(docsFolder, file), 'utf8');
      for (const link of linksOf(markdown)) {
        const target = link.split('#')[0] ?? '';
        expect(existsSync(path.join(docsFolder, target)), `${file} links to ${link}`).toBe(true);
      }
      expect(markdown, file).not.toMatch(/kvdev/i);
      expect(markdown, file).not.toMatch(/\bdev\b[ -]preset|preset[ '`]*dev\b/i);
    }
  });
});
