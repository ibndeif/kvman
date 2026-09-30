import { jsonSchema, z } from '@kvman/sdk';
import { localIdSchema, viewSchema, type View } from './views.ts';

// The answer of `<namespace>.ui.get` (plan 06 §6.3), and the checks beyond its shape (ADR 0009, 72): an answer that
// fails any of them contributes nothing.

const textKey = z.string().min(1);
const values = z.record(z.string(), jsonSchema);

export const contributionsSchema = z.object({
  pages: z.array(z.object({ id: localIdSchema, title: textKey, params: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/)).exactOptional(), view: viewSchema })),
  nav: z.array(z.object({ id: localIdSchema, page: localIdSchema, title: textKey, icon: z.string().min(1), order: z.number() })),
  panels: z.array(z.object({ id: localIdSchema, title: textKey, icon: z.string().min(1), view: viewSchema })),
  status: z.array(z.object({ id: localIdSchema, query: z.string().min(1), input: values, text: textKey, params: values.exactOptional(), order: z.number() })),
});

export type Contributions = z.output<typeof contributionsSchema>;

export type Issue = { path: string; message: string };

/** What an answer may name: the public queries and commands of the run (the kernel's included), and the icons. */
export type Known = { publicQueries: ReadonlySet<string>; publicCommands: ReadonlySet<string>; icons: ReadonlySet<string> };

// The `{ $param: name }` references anywhere in a JSON tree.
function paramReferences(tree: unknown): string[] {
  if (Array.isArray(tree)) return tree.flatMap(paramReferences);
  if (typeof tree !== 'object' || tree === null) return [];
  const entries = Object.entries(tree);
  if (entries.length === 1 && entries[0]?.[0] === '$param' && typeof entries[0][1] === 'string') return [entries[0][1]];
  return entries.flatMap(([, value]) => paramReferences(value));
}

type Call = { path: string; name: string };

// The queries and commands a view names, with their paths.
function callsOf(view: View, path: string): { queries: Call[]; commands: Call[] } {
  const queries: Call[] = [];
  const commands: Call[] = [];
  const visit = (node: View, at: string): void => {
    if ('query' in node && node.query !== undefined) queries.push({ path: `${at}.query`, name: node.query });
    if (node.type === 'form') commands.push({ path: `${at}.command`, name: node.command });
    if (node.type === 'stack' || node.type === 'card') node.children.forEach((child, index) => visit(child, `${at}.children.${String(index)}`));
    if (node.type === 'list') visit(node.item, `${at}.item`);
  };
  visit(view, path);
  return { queries, commands };
}

function duplicates(ids: readonly string[], part: string): Issue[] {
  return ids.flatMap((id, index) => (ids.indexOf(id) === index ? [] : [{ path: `${part}.${String(index)}.id`, message: `The id "${id}" repeats.` }]));
}

function viewIssues(view: View, path: string, params: readonly string[], known: Known): Issue[] {
  const { queries, commands } = callsOf(view, path);
  return [
    ...queries.filter((call) => !known.publicQueries.has(call.name)).map((call) => ({ path: call.path, message: `"${call.name}" isn't a public query.` })),
    ...commands.filter((call) => !known.publicCommands.has(call.name)).map((call) => ({ path: call.path, message: `"${call.name}" isn't a public command.` })),
    ...paramReferences(view)
      .filter((name) => !params.includes(name))
      .map((name) => ({ path, message: `The param "${name}" isn't declared.` })),
  ];
}

export function contributionIssues(answer: Contributions, known: Known): Issue[] {
  const pageParams = new Map(answer.pages.map((page) => [page.id, page.params ?? []]));
  return [
    ...duplicates(answer.pages.map((page) => page.id), 'pages'),
    ...duplicates(answer.nav.map((item) => item.id), 'nav'),
    ...duplicates(answer.panels.map((panel) => panel.id), 'panels'),
    ...duplicates(answer.status.map((item) => item.id), 'status'),
    ...answer.pages.flatMap((page, index) => viewIssues(page.view, `pages.${String(index)}.view`, page.params ?? [], known)),
    ...answer.panels.flatMap((panel, index) => viewIssues(panel.view, `panels.${String(index)}.view`, [], known)),
    ...answer.nav.flatMap((item, index) => {
      const params = pageParams.get(item.page);
      if (params === undefined) return [{ path: `nav.${String(index)}.page`, message: `There's no page "${item.page}".` }];
      return params.length > 0 ? [{ path: `nav.${String(index)}.page`, message: `The page "${item.page}" has params.` }] : [];
    }),
    ...[...answer.nav.map((item, index) => ({ icon: item.icon, path: `nav.${String(index)}.icon` })), ...answer.panels.map((panel, index) => ({ icon: panel.icon, path: `panels.${String(index)}.icon` }))]
      .filter((entry) => !known.icons.has(entry.icon))
      .map((entry) => ({ path: entry.path, message: `"${entry.icon}" isn't a lucide icon.` })),
    ...answer.status.flatMap((item, index) => (known.publicQueries.has(item.query) ? [] : [{ path: `status.${String(index)}.query`, message: `"${item.query}" isn't a public query.` }])),
  ];
}
