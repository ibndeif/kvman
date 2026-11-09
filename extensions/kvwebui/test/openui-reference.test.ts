import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chatLibraryDefinition, fullLibraryDefinition } from '../web/src/openui/definitions/libraries.ts';
import { groupSlug, openuiReferencePages } from '../web/src/openui/reference/reference-pages.ts';
import { useKvwebuiKernel } from './support/kvwebui-kernel.ts';

const kvwebui = useKvwebuiKernel();
const docsFolder = fileURLToPath(new URL('../docs/', import.meta.url));
const pages = openuiReferencePages();
const indexes = { 'openui-chat': chatLibraryDefinition, openui: fullLibraryDefinition };
const bytes = (text: string): number => Buffer.byteLength(text, 'utf8');
const groupPages = (index: string): string[] => [...pages.keys()].filter((topic) => topic.startsWith(`${index}-`) && !(index === 'openui' && topic.startsWith('openui-chat')));

// The components of M5.20 (ADR 0124, 4), which no page may name before they are built. A name that is also an ordinary
// word is matched only as a call or as a type in a signature.
const later = ['SnippetCardBlock', 'SnippetCardItem', 'OverviewCardBlock', 'OverviewCardItem', 'ContextCardBlock', 'ContextCardItem', 'CompositeCardBlock', 'CompositeCardItem', 'VisualCardBlock', 'VisualCardItem', 'BoldText', 'IconText', 'ImageText', 'ImageTextLarge', 'MetricIndicatorInline', 'MetricIndicatorWithStrikethrough', 'ImageBlock', 'ImageGallery', 'Modal', 'Carousel', 'OptionCards', 'OptionCard'];
const laterWords = ['Text', 'Image'];
const laterGroups = ['Cards'];

// The `@` steps that aren't inside an `Action([…])` list.
function bareSteps(text: string): string[] {
  const bare: string[] = [];
  for (const match of text.matchAll(/@(ToAssistant|OpenUrl|Set|Reset)\(/g)) {
    const before = text.slice(0, match.index);
    const opened = before.lastIndexOf('[');
    const closed = before.lastIndexOf(']');
    const listed = opened > closed && before.slice(0, opened).endsWith('Action(');
    const described = /(^|\n)- $/.test(before.slice(-3)) || /\(equivalent to Action\(\[$/.test(before);
    if (!listed && !described && /[(,]\s*$/.test(before)) bare.push(text.slice(Math.max(0, match.index - 40), match.index + 20));
  }
  return bare;
}

describe('the OpenUI reference pages (06 §6.9, ADR 0124, 12)', () => {
  it('M5.18-H12 every OpenUI page in docs/ is what openui:reference writes, and no other is there', () => {
    const files = readdirSync(docsFolder).filter((file) => /^openui(-[a-z0-9-]+)?\.md$/.test(file));
    expect(files.map((file) => file.slice(0, -'.md'.length)).sort()).toEqual([...pages.keys()].sort());
    for (const [topic, markdown] of pages) expect(readFileSync(path.join(docsFolder, `${topic}.md`), 'utf8'), topic).toBe(markdown);
    for (const [index, definition] of Object.entries(indexes)) {
      for (const group of definition.componentGroups) expect(pages.get(`${index}-${groupSlug(group.name)}`)?.split('\n')[0], group.name).toBe(`# ${group.name}`);
    }
  });

  it("M5.18-H13 an index has kvman's rules, OpenUI Lang's rules, each group with exactly its components, and an example", async () => {
    for (const [index, definition] of Object.entries(indexes)) {
      const markdown = pages.get(index) ?? '';
      for (const words of ['fenced `openui` block', "format: 'openui'", 'There is no Query, Mutation, or @Run', 'a path in the workspace or a `data:` address', '`<label>: <value>`', '## Syntax Rules', '## Built-in Functions', '## Action — Button Behavior', '## Hoisting & Streaming', '## Example']) {
        expect(markdown, `${index}: ${words}`).toContain(words);
      }
      for (const group of definition.componentGroups) expect(markdown, group.name).toContain(`\n- ${group.name}: ${group.components.join(', ')}\n`);
      expect(markdown).toContain(index === 'openui' ? 'root = Stack([' : '```openui\nroot = Card([');
    }
    const kernel = await kvwebui.start([]);
    const titled = [...pages].map(([topic, markdown]) => ({ topic, title: (markdown.split('\n')[0] ?? '').slice('# '.length) }));
    expect(await kernel.exec('kvwebui.docs.list', {})).toEqual(expect.arrayContaining(titled));
    expect(await kernel.exec('kvwebui.docs.get', { topic: 'openui-chat-forms' })).toEqual({ topic: 'openui-chat-forms', title: 'Forms', markdown: pages.get('openui-chat-forms') });
  });

  it('M5.18-E14 M5.19-E5 no page uses Query, Mutation, @Run, or a query\'s rows, and every step is inside Action([…])', () => {
    for (const [topic, markdown] of pages) {
      expect(markdown, topic).not.toMatch(/Query\(|Mutation\(|@Run\(|data\.rows/);
      expect(bareSteps(markdown), topic).toEqual([]);
    }
  });

  it('M5.18-E15 M5.19-E5 no page names a component of M5.20, and a group with none built has no page and no line', () => {
    for (const [topic, markdown] of pages) {
      for (const name of later) expect(markdown, `${topic}: ${name}`).not.toMatch(new RegExp(`\\b${name}\\b`));
      for (const name of laterWords) expect(markdown, `${topic}: ${name}`).not.toMatch(new RegExp(`\\b${name}\\(|[(|:]\\s*${name}(\\[\\])?(?=[\\s|)\\],])`));
    }
    for (const index of Object.keys(indexes)) {
      for (const group of laterGroups) {
        expect(pages.has(`${index}-${groupSlug(group)}`), `${index}: ${group}`).toBe(false);
        expect(pages.get(index), `${index}: ${group}`).not.toContain(`\n- ${group}:`);
      }
    }
  });

  it("M5.18-E16 M5.19-E5 each index is at most 8 KB, and a library's group pages joined are at most 30 KB", () => {
    for (const index of Object.keys(indexes)) {
      expect(bytes(pages.get(index) ?? ''), index).toBeLessThanOrEqual(8 * 1024);
      const joined = groupPages(index).map((topic) => pages.get(topic) ?? '').join('\n\n');
      expect(bytes(joined), index).toBeLessThanOrEqual(30 * 1024);
    }
  });

  it("M5.19-H8 the tables, charts, and lists have their groups' pages, with OpenUI's notes in terms of an array the UI holds", () => {
    for (const index of Object.keys(indexes)) {
      for (const group of ['Tables', 'Charts (2D)', 'Charts (1D)', 'Charts (Scatter)']) expect(pages.has(`${index}-${groupSlug(group)}`), `${index}: ${group}`).toBe(true);
    }
    expect(pages.get('openui-data-display')).toContain('ListBlock(items: ListItem[]');
    expect(pages.get('openui-data-display')).toContain('EntityList(');
    expect(pages.get('openui-chat-lists-follow-ups')).toContain('ListItem(title: string');
    expect(pages.get('openui-tables')).toContain('- Sortable: sorted = @Sort(items, $sortField, "desc")');
    expect(pages.get('openui-charts-2d')).toContain('LineChart(items.day, [Series("Views", items.views)])');
    expect(pages.get('openui-chat-lists-follow-ups')).toContain('ListItem("Option A", "Details about A", null, null, Action([@ToAssistant("Option A")]))');
  });
});
