import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ProblemError } from '@kvman/sdk';

// Documentation pages as Markdown files in a folder (plan 09 §9.5): topic = file name without `.md`, which must be a
// lowercase kebab-case segment; title = the first line that starts with `# `, else the topic.

export const topicPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A page in a listing. */
export type PageEntry = { topic: string; title: string };

/** A page with its content. */
export type Page = PageEntry & { markdown: string };

function titleOf(topic: string, markdown: string): string {
  for (const line of markdown.split('\n')) {
    if (line.startsWith('# ')) return line.slice('# '.length);
  }
  return topic;
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

/** The page files of `folder` (without `exclude`), sorted by topic. */
export function listPages(folder: string, exclude: readonly string[] = []): PageEntry[] {
  return readdirSync(folder)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => entry.slice(0, -'.md'.length))
    .filter((topic) => topicPattern.test(topic) && !exclude.includes(topic))
    .sort()
    .map((topic) => ({ topic, title: titleOf(topic, readFileSync(path.join(folder, `${topic}.md`), 'utf8')) }));
}

/** The page on `topic`, or `undefined` when the topic isn't a valid name or has no file. */
export function readPage(folder: string, topic: string, exclude: readonly string[] = []): Page | undefined {
  if (!topicPattern.test(topic) || exclude.includes(topic)) return undefined;
  try {
    const markdown = readFileSync(path.join(folder, `${topic}.md`), 'utf8');
    return { topic, title: titleOf(topic, markdown), markdown };
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

/** The `NOT_FOUND` Problem for a topic with no page. */
export function noSuchTopic(topic: string, whose: string): ProblemError {
  return new ProblemError({ code: 'NOT_FOUND', message: `${whose} has no documentation page "${topic}".`, params: { topic } });
}
