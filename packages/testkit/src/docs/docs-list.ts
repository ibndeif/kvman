import { ProblemError, extensionInfoSchema, z, type Problem } from '@kvman/sdk';
import { listBuiltInGuides } from './built-in-guides.ts';
import { callQuery } from '../running/call-query.ts';
import { KvmanUnreachableError, type RunningKvman } from '../running/running-kvman.ts';

// `kvman-docs list` (plan 09 §9.5): the built-in guides first, then the pages of every loaded extension that serves
// both `<namespace>.docs.list` and `<namespace>.docs.get` as public queries. One extension never hides another.

/** A docs page in the listing. */
export type DocsListPage = { extension: string; topic: string; title: string };

/** An extension whose docs failed, with its Problem. */
export type DocsListProblem = { extension: string; problem: Problem };

/** The listing: the pages, the per-extension problems, and whether a kvman answered. */
export type DocsListing = { pages: DocsListPage[]; problems: DocsListProblem[]; running: boolean };

const docsListSchema = z.array(z.strictObject({ topic: z.string(), title: z.string() }));
const extensionsListSchema = z.array(extensionInfoSchema);

type DocumentedExtension = { name: string; namespace: string };

function documented(extensions: z.output<typeof extensionsListSchema>): DocumentedExtension[] {
  return extensions
    .filter((extension) => [`${extension.namespace}.docs.list`, `${extension.namespace}.docs.get`].every((wanted) => extension.queries.some((query) => query.name === wanted && query.public)))
    .map((extension) => ({ name: extension.name, namespace: extension.namespace }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

/** Lists the docs pages, reading only the built-in guides when no kvman runs. */
export async function listDocsPages(running: RunningKvman | undefined): Promise<DocsListing> {
  const builtIn: DocsListPage[] = listBuiltInGuides().map((guide) => ({ extension: guide.extension, topic: guide.topic, title: guide.title }));
  if (running === undefined) return { pages: builtIn, problems: [], running: false };
  let extensions: z.output<typeof extensionsListSchema>;
  try {
    extensions = await callQuery(running, 'kernel.extensions.list', {}, extensionsListSchema);
  } catch (error) {
    if (error instanceof KvmanUnreachableError) return { pages: builtIn, problems: [], running: false };
    throw error;
  }
  const pages: DocsListPage[] = [...builtIn];
  const problems: DocsListProblem[] = [];
  for (const extension of documented(extensions)) {
    let entries: z.output<typeof docsListSchema>;
    try {
      entries = await callQuery(running, `${extension.namespace}.docs.list`, {}, docsListSchema);
    } catch (error) {
      if (error instanceof KvmanUnreachableError) return { pages: builtIn, problems: [], running: false };
      if (error instanceof ProblemError) {
        problems.push({ extension: extension.name, problem: error.problem });
        continue;
      }
      if (!(error instanceof z.ZodError)) throw error;
      problems.push({ extension: extension.name, problem: { code: 'VALIDATION_FAILED', message: `${extension.namespace}.docs.list answered something other than a list of pages.` } });
      continue;
    }
    for (const entry of entries) pages.push({ extension: extension.name, topic: entry.topic, title: entry.title });
  }
  return { pages, problems, running: true };
}
