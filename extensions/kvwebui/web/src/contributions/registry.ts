import { kernelCommandSchemas, kernelQuerySchemas, type Problem } from '@kvman/sdk';
import type { ExtensionInfo } from '../api/kernel.ts';
import { problemOf, type Api } from '../api/client.ts';
import { contributionIssues, contributionsSchema, type Contributions, type Known } from './answer.ts';
import type { Values, View } from './views.ts';

// What the extensions contribute (plan 06 §6.3): kvwebui reads `kernel.extensions.list` when the browser loads and calls
// every `<namespace>.ui.get`. An answer that fails, or fails its checks, contributes nothing and is listed instead.

export type PageEntry = { id: string; namespace: string; title: string; params: string[]; view: View };
export type NavEntry = { id: string; namespace: string; page: string; title: string; icon: string; order: number };
export type PanelEntry = { id: string; namespace: string; title: string; icon: string; view: View };
export type StatusEntry = { id: string; namespace: string; query: string; input: Values; text: string; params: Values; order: number };
export type LoadFailure = { extension: string; namespace: string; problem: Problem };

export type Registry = { pages: Map<string, PageEntry>; nav: NavEntry[]; panels: PanelEntry[]; status: StatusEntry[]; failures: LoadFailure[]; known: Known };

export function emptyRegistry(): Registry {
  return { pages: new Map(), nav: [], panels: [], status: [], failures: [], known: knownCalls([], new Set()) };
}

export function knownCalls(extensions: readonly ExtensionInfo[], icons: ReadonlySet<string>): Known {
  const publicNames = (calls: ExtensionInfo['queries']) => calls.filter((call) => call.public).map((call) => call.name);
  return {
    publicQueries: new Set([...Object.keys(kernelQuerySchemas), ...extensions.flatMap((extension) => publicNames(extension.queries))]),
    publicCommands: new Set([...Object.keys(kernelCommandSchemas), ...extensions.flatMap((extension) => publicNames(extension.commands))]),
    namespaces: new Set(extensions.map((extension) => extension.namespace)),
    icons,
  };
}

// An answer's contributions, or the Problem that keeps it out.
export function checkAnswer(answer: unknown, known: Known): { contributions: Contributions } | { problem: Problem } {
  const parsed = contributionsSchema.safeParse(answer);
  const issues = parsed.success
    ? contributionIssues(parsed.data, known)
    : parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
  if (issues.length > 0 || !parsed.success) return { problem: { code: 'VALIDATION_FAILED', message: 'The UI contributions are invalid.', params: { issues } } };
  return { contributions: parsed.data };
}

function add(registry: Registry, namespace: string, contributions: Contributions): void {
  const full = (id: string) => `${namespace}.${id}`;
  for (const page of contributions.pages) registry.pages.set(full(page.id), { id: full(page.id), namespace, title: page.title, params: page.params ?? [], view: page.view });
  registry.nav.push(...contributions.nav.map((item) => ({ ...item, id: full(item.id), namespace, page: full(item.page) })));
  registry.panels.push(...contributions.panels.map((panel) => ({ ...panel, id: full(panel.id), namespace })));
  registry.status.push(...contributions.status.map((item) => ({ ...item, id: full(item.id), namespace, params: item.params ?? {} })));
}

export async function loadRegistry(api: Api, extensions: readonly ExtensionInfo[], icons: ReadonlySet<string>): Promise<Registry> {
  const known = knownCalls(extensions, icons);
  const contributing = extensions.filter((extension) => extension.queries.some((query) => query.name === `${extension.namespace}.ui.get`));
  const answers = await Promise.all(
    contributing.map(async (extension) => {
      const result = await api.query(`${extension.namespace}.ui.get`, {}).then(
        (answer) => checkAnswer(answer, known),
        (error: unknown) => ({ problem: problemOf(error) }),
      );
      return { extension, result };
    }),
  );
  const registry = { ...emptyRegistry(), known };
  for (const { extension, result } of answers) {
    if ('problem' in result) registry.failures.push({ extension: extension.name, namespace: extension.namespace, problem: result.problem });
    else add(registry, extension.namespace, result.contributions);
  }
  registry.status.sort((first, second) => first.order - second.order || first.id.localeCompare(second.id));
  return registry;
}
