import { jsonSchema, z, type Json, type Problem } from '@kvman/sdk';
import { formattedOutput, outputFormats, paramNames } from './references.ts';
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
  configuration: viewSchema.exactOptional(),
});

export type Contributions = z.output<typeof contributionsSchema>;

export type Issue = { path: string; message: string };

/** What an answer may name: the public queries and commands of the run (the kernel's included), the loaded extensions' namespaces, and the icons. */
export type Known = { publicQueries: ReadonlySet<string>; publicCommands: ReadonlySet<string>; namespaces: ReadonlySet<string>; icons: ReadonlySet<string> };

type Named = { path: string; name: string };

type Names = { queries: Named[]; commands: Named[]; components: Named[]; settings: Named[] };

// The queries, commands, custom components, and settings a view names, with their paths.
function namesOf(view: View, path: string): Names {
  const found: Names = { queries: [], commands: [], components: [], settings: [] };
  const visit = (node: View, at: string): void => {
    if ('query' in node && node.query !== undefined) found.queries.push({ path: `${at}.query`, name: node.query });
    if (node.type === 'form') found.commands.push({ path: `${at}.command`, name: node.command });
    if (node.type === 'custom') found.components.push({ path: `${at}.component`, name: node.component });
    if (node.type === 'setting') found.settings.push({ path: `${at}.key`, name: node.key });
    if (node.type === 'stack' || node.type === 'card') node.children.forEach((child, index) => visit(child, `${at}.children.${String(index)}`));
    if (node.type === 'list') visit(node.item, `${at}.item`);
  };
  visit(view, path);
  return found;
}

function duplicates(ids: readonly string[], part: string): Issue[] {
  return ids.flatMap((id, index) => (ids.indexOf(id) === index ? [] : [{ path: `${part}.${String(index)}.id`, message: `The id "${id}" repeats.` }]));
}

// A `setting` view belongs in `configuration`, and names one of the extension's own keys (ADR 0014, 3).
function settingIssue(setting: Named, ownSettings: ReadonlySet<string> | undefined): Issue[] {
  if (ownSettings === undefined) return [{ path: setting.path, message: 'A setting view belongs in configuration.' }];
  return ownSettings.has(setting.name) ? [] : [{ path: setting.path, message: `"${setting.name}" isn't one of the extension's settings.` }];
}

// `ownSettings` is the extension's keys when the view is its configuration, and `undefined` for any other view.
function viewIssues(view: View, path: string, params: readonly string[], known: Known, ownSettings?: ReadonlySet<string>): Issue[] {
  const { queries, commands, components, settings } = namesOf(view, path);
  return [
    ...settings.flatMap((setting) => settingIssue(setting, ownSettings)),
    ...queries.filter((call) => !known.publicQueries.has(call.name)).map((call) => ({ path: call.path, message: `"${call.name}" isn't a public query.` })),
    ...commands.filter((call) => !known.publicCommands.has(call.name)).map((call) => ({ path: call.path, message: `"${call.name}" isn't a public command.` })),
    ...components.filter((custom) => !known.namespaces.has(custom.name.split('.')[0] ?? '')).map((custom) => ({ path: custom.path, message: `"${custom.name}" isn't a loaded extension's component.` })),
    ...paramNames(view)
      .filter((name) => !params.includes(name))
      .map((name) => ({ path, message: `The param "${name}" isn't declared.` })),
  ];
}

// A status param's `format` must be one kvwebui knows (ADR 0009, 146).
function formatIssues(params: Record<string, Json>, path: string): Issue[] {
  return Object.entries(params).flatMap(([name, value]) => {
    const format = formattedOutput(value)?.format;
    return format === undefined || outputFormats.some((known) => known === format) ? [] : [{ path: `${path}.${name}.format`, message: `"${String(format)}" isn't a format (${outputFormats.join(' or ')}).` }];
  });
}

export function contributionIssues(answer: Contributions, known: Known, ownSettings: ReadonlySet<string>): Issue[] {
  const pageParams = new Map(answer.pages.map((page) => [page.id, page.params ?? []]));
  return [
    ...duplicates(answer.pages.map((page) => page.id), 'pages'),
    ...duplicates(answer.nav.map((item) => item.id), 'nav'),
    ...duplicates(answer.panels.map((panel) => panel.id), 'panels'),
    ...duplicates(answer.status.map((item) => item.id), 'status'),
    ...answer.pages.flatMap((page, index) => viewIssues(page.view, `pages.${String(index)}.view`, page.params ?? [], known)),
    ...answer.panels.flatMap((panel, index) => viewIssues(panel.view, `panels.${String(index)}.view`, [], known)),
    ...(answer.configuration === undefined ? [] : viewIssues(answer.configuration, 'configuration', [], known, ownSettings)),
    ...answer.nav.flatMap((item, index) => {
      const params = pageParams.get(item.page);
      if (params === undefined) return [{ path: `nav.${String(index)}.page`, message: `There's no page "${item.page}".` }];
      return params.length > 0 ? [{ path: `nav.${String(index)}.page`, message: `The page "${item.page}" has params.` }] : [];
    }),
    ...[...answer.nav.map((item, index) => ({ icon: item.icon, path: `nav.${String(index)}.icon` })), ...answer.panels.map((panel, index) => ({ icon: panel.icon, path: `panels.${String(index)}.icon` }))]
      .filter((entry) => !known.icons.has(entry.icon))
      .map((entry) => ({ path: entry.path, message: `"${entry.icon}" isn't a lucide icon.` })),
    ...answer.status.flatMap((item, index) => (known.publicQueries.has(item.query) ? [] : [{ path: `status.${String(index)}.query`, message: `"${item.query}" isn't a public query.` }])),
    ...answer.status.flatMap((item, index) => formatIssues(item.params ?? {}, `status.${String(index)}.params`)),
  ];
}

// A view tree a custom component gives `kvman.View` (ADR 0009, 83): checked like a `ui.get` view, on a page with `params`.
export function checkView(tree: unknown, params: readonly string[], known: Known): { view: View } | { problem: Problem } {
  const parsed = viewSchema.safeParse(tree);
  const issues = parsed.success ? viewIssues(parsed.data, 'view', params, known) : parsed.error.issues.map((issue) => ({ path: ['view', ...issue.path.map(String)].join('.'), message: issue.message }));
  if (!parsed.success || issues.length > 0) return { problem: { code: 'VALIDATION_FAILED', message: 'The view is invalid.', params: { issues } } };
  return { view: parsed.data };
}
