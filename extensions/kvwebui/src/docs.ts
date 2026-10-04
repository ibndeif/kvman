import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProblemError, z, type Ctx } from '@kvman/sdk';

// kvwebui's documentation pages (plan 06 §6.9, plan 09 §9.5): the Markdown files in `docs/`, served by
// `kvwebui.docs.list` and `kvwebui.docs.get`. The folder sits next to this module, from `src/` and from `dist/`.

const pagesFolder = fileURLToPath(new URL('../docs/', import.meta.url));

const topicPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function notFound(topic: string): ProblemError {
  return new ProblemError({ code: 'NOT_FOUND', message: `There is no documentation page ${topic}.` });
}

function titleOf(topic: string, markdown: string): string {
  for (const line of markdown.split('\n')) {
    if (line.startsWith('# ')) return line.slice('# '.length);
  }
  return topic;
}

/** Lists the documentation pages, sorted by topic. */
export function listDocs(): { topic: string; title: string }[] {
  return readdirSync(pagesFolder)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => entry.slice(0, -'.md'.length))
    .filter((topic) => topicPattern.test(topic))
    .sort()
    .map((topic) => ({ topic, title: titleOf(topic, readFileSync(path.join(pagesFolder, `${topic}.md`), 'utf8')) }));
}

/** Gives one documentation page; an unknown or invalid topic is `NOT_FOUND`. */
export function getDoc(topic: string): { topic: string; title: string; markdown: string } {
  if (!topicPattern.test(topic)) throw notFound(topic);
  let markdown: string;
  try {
    markdown = readFileSync(path.join(pagesFolder, `${topic}.md`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw notFound(topic);
    throw error;
  }
  return { topic, title: titleOf(topic, markdown), markdown };
}

export function registerDocs(ctx: Ctx): void {
  ctx.registerQuery('kvwebui.docs.list', {
    description: 'Lists the documentation pages of kvwebui.',
    public: true,
    input: z.object({}),
    output: z.array(z.object({ topic: z.string(), title: z.string() })),
    handle: () => listDocs(),
  });

  ctx.registerQuery('kvwebui.docs.get', {
    description: 'Gives one documentation page of kvwebui.',
    public: true,
    input: z.object({ topic: z.string().describe('The page topic: views or components.') }),
    output: z.object({ topic: z.string(), title: z.string(), markdown: z.string() }),
    handle: (input) => getDoc(input.topic),
  });
}
