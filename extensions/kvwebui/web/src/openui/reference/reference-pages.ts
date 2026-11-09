import { createLibrary } from '@openuidev/lang-core';
import { chatLibraryDefinition, fullLibraryDefinition } from '../definitions/libraries.ts';
import type { OpenuiComponentDefinition } from '../definitions/define.ts';
import type { ComponentGroup } from '@openuidev/lang-core';
import { builtinUse, placeExample, placeRules, streamingRules, type Place } from './kvman-rules.ts';

// The OpenUI reference pages (plan 06 §6.9, ADR 0124, 12): for each library, an index (kvman's rules, OpenUI Lang's
// rules as lang-core writes them, the groups and their components, examples) and one page per group (its signatures and
// notes). `openui guide` reads them through kvwebui's docs query; `scripts/openui-reference.ts` writes them to `docs/`.

type LibrarySource = { root: string; components: OpenuiComponentDefinition[]; componentGroups: ComponentGroup[] };

const places: readonly { place: Place; topic: string; definition: LibrarySource }[] = [
  { place: 'reply', topic: 'openui-chat', definition: chatLibraryDefinition },
  { place: 'artifact', topic: 'openui', definition: fullLibraryDefinition },
];

/** A group's page topic part: its name in lowercase, each run of other characters a `-`. */
export function groupSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// The prompt lang-core writes for a library, with `$variables` and no tools; the renderer is irrelevant to it, so each
// component carries its name.
function promptOf(definition: LibrarySource): string {
  const components = definition.components.map((component) => ({ ...component, component: component.name }));
  return createLibrary({ root: definition.root, components, componentGroups: definition.componentGroups }).prompt({ preamble: '', bindings: true, toolCalls: false });
}

function sectionsOf(prompt: string): Map<string, string> {
  const sections = new Map<string, string>();
  for (const part of prompt.split(/\n(?=## )/)) {
    const heading = part.split('\n')[0] ?? '';
    if (heading.startsWith('## ')) sections.set(heading.slice(3), part.trim());
  }
  return sections;
}

function section(sections: ReadonlyMap<string, string>, heading: string): string {
  const found = sections.get(heading);
  if (found === undefined) throw new Error(`lang-core's prompt has no "${heading}" section.`);
  return found;
}

// lang-core's built-in functions: its heading, its first line, and the functions, then kvman's lines in place of its
// own about `Query` results and tables.
function builtins(text: string): string {
  const [heading = '', , first = ''] = text.split('\n');
  if (!first.startsWith('Data functions')) throw new Error("lang-core's built-in functions section changed.");
  const functions = text.split('\n').filter((line) => /^@\w+\(/.test(line));
  return [heading, '', first, '', ...functions, '', builtinUse].join('\n');
}

// A group's components; lang-core puts the components of no group in a group named `Other`.
function membersOf(name: string, definition: LibrarySource): string[] {
  const grouped = definition.componentGroups.find((group) => group.name === name);
  if (grouped !== undefined) return grouped.components;
  const inGroups = new Set(definition.componentGroups.flatMap((group) => group.components));
  return [...new Set(definition.components.map((component) => component.name))].filter((component) => !inGroups.has(component));
}

function groupsOf(signatures: string): { name: string; body: string }[] {
  return signatures
    .split(/\n(?=### )/)
    .slice(1)
    .map((part) => {
      const [heading = '', ...rest] = part.split('\n');
      return { name: heading.slice(4).trim(), body: rest.join('\n').trim() };
    });
}

function indexPage(place: Place, sections: ReadonlyMap<string, string>, groups: readonly { name: string; body: string }[], definition: LibrarySource): string {
  const signatures = section(sections, 'Component Signatures');
  const intro = (signatures.split(/\n(?=### )/)[0] ?? '').split('\n').slice(1).join('\n').trim();
  const listed = groups.map((group) => `- ${group.name}: ${membersOf(group.name, definition).join(', ')}`);
  return [
    placeRules(place),
    section(sections, 'Syntax Rules'),
    builtins(section(sections, 'Built-in Functions')),
    section(sections, 'Action — Button Behavior'),
    streamingRules(definition.root),
    section(sections, 'Final Verification'),
    ['## Components', '', intro, '', `Read a group's signatures and notes with \`openui guide { place: '${place}', groups: ['<group>', …] }\`. The groups:`, '', ...listed].join('\n'),
    ['## Example', '', placeExample(place)].join('\n'),
  ].join('\n\n');
}

/** Every OpenUI reference page, by topic, as Markdown ending in a newline. */
export function openuiReferencePages(): Map<string, string> {
  const pages = new Map<string, string>();
  for (const { place, topic, definition } of places) {
    const sections = sectionsOf(promptOf(definition));
    const groups = groupsOf(section(sections, 'Component Signatures'));
    pages.set(topic, `${indexPage(place, sections, groups, definition)}\n`);
    for (const group of groups) pages.set(`${topic}-${groupSlug(group.name)}`, `# ${group.name}\n\n${group.body}\n`);
  }
  return pages;
}
