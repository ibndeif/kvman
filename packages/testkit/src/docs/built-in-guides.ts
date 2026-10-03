import { readFileSync } from 'node:fs';

// The built-in guides (ADR 0010, 16–17): the testkit's `docs/` folder, found relative to this module both from
// `src/docs/` and from `dist/docs/`. They read with no kvman running.

/** A built-in guide: `extension` is always `"kvman"`. */
export type BuiltInGuide = { extension: 'kvman'; topic: string; title: string; markdown: string };

const builtInTopics = ['i18n', 'presets', 'sdk'] as const;

function titleOf(topic: string, markdown: string): string {
  const first = markdown.split('\n', 1)[0];
  return first !== undefined && first.startsWith('# ') ? first.slice(2) : topic;
}

function readGuide(topic: string): BuiltInGuide {
  const markdown = readFileSync(new URL(`../../docs/${topic}.md`, import.meta.url), 'utf8');
  return { extension: 'kvman', topic, title: titleOf(topic, markdown), markdown };
}

/** The three built-in guides, sorted by topic. */
export function listBuiltInGuides(): BuiltInGuide[] {
  return builtInTopics.map((topic) => readGuide(topic));
}

/** The built-in guide on a topic, or `undefined` for any other topic. */
export function readBuiltInGuide(topic: string): BuiltInGuide | undefined {
  const known = (builtInTopics as readonly string[]).includes(topic);
  return known ? readGuide(topic) : undefined;
}
