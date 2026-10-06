import { ProblemError, problemSchema, z, type Ctx, type Problem } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import { testkitDocsFolder } from '../run-bin.ts';
import { listPages, noSuchTopic, readPage, topicPattern } from './pages.ts';

// The `docs` connector's two queries (plan 09 §9.1 and §9.5, ADR 0010, 15–17 and 22): the built-in guides of kvman
// (the testkit's `docs/`), then the pages every loaded extension serves through its public `<namespace>.docs.list`
// and `<namespace>.docs.get`. kvbuilder pulls them, so no extension registers anything with it.

const builtIn = 'kvman';

export const guidePageSchema = z.object({ extension: z.string(), topic: z.string(), title: z.string() });

export const guideListSchema = z.object({
  pages: z.array(guidePageSchema),
  problems: z.array(z.object({ extension: z.string(), problem: problemSchema })),
});

export const guideSchema = guidePageSchema.extend({ markdown: z.string() });

const listAnswerSchema = z.array(z.strictObject({ topic: z.string(), title: z.string() }));
const pageAnswerSchema = z.strictObject({ topic: z.string(), title: z.string(), markdown: z.string() });

type Documented = { name: string; namespace: string };

// The loaded extensions that serve docs: both queries, public.
async function documentedExtensions(ctx: Ctx): Promise<Documented[]> {
  const extensions = await ctx.exec('kernel.extensions.list', {});
  return extensions
    .filter((extension) => [`${extension.namespace}.docs.list`, `${extension.namespace}.docs.get`].every((wanted) => extension.queries.some((query) => query.name === wanted && query.public)))
    .map((extension) => ({ name: extension.name, namespace: extension.namespace }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function invalidAnswer(extension: Documented, query: string, what: string): Problem {
  return { code: 'VALIDATION_FAILED', message: `${extension.namespace}.${query} answered something other than ${what}.` };
}

/** Every page: the built-in guides first, then each documenting extension's, with the extensions whose docs failed. */
export async function listGuides(ctx: Ctx): Promise<z.output<typeof guideListSchema>> {
  const pages = listPages(testkitDocsFolder()).map((entry) => ({ extension: builtIn, ...entry }));
  const problems: z.output<typeof guideListSchema>['problems'] = [];
  for (const extension of await documentedExtensions(ctx)) {
    try {
      const answer = listAnswerSchema.safeParse(await ctx.exec(`${extension.namespace}.docs.list`, {}));
      if (answer.success) for (const entry of answer.data) pages.push({ extension: extension.name, ...entry });
      else problems.push({ extension: extension.name, problem: invalidAnswer(extension, 'docs.list', 'a list of pages') });
    } catch (error) {
      if (!(error instanceof ProblemError)) throw error;
      problems.push({ extension: extension.name, problem: error.problem });
    }
  }
  return { pages, problems };
}

/** One page: a built-in guide with no extension (or `kvman`), else the extension's own page. */
export async function getGuide(ctx: Ctx, input: { extension?: string | undefined; topic: string }): Promise<z.output<typeof guideSchema>> {
  if (!topicPattern.test(input.topic)) throw invalid(`"${input.topic}" isn't a lowercase kebab-case topic.`, { topic: input.topic });
  if (input.extension === undefined || input.extension === builtIn) {
    const page = readPage(testkitDocsFolder(), input.topic);
    if (page === undefined) throw noSuchTopic(input.topic, builtIn);
    return { extension: builtIn, ...page };
  }
  const documented = (await documentedExtensions(ctx)).find((extension) => extension.name === input.extension);
  if (documented === undefined) {
    throw new ProblemError({ code: 'NOT_FOUND', message: `${input.extension} isn't loaded or doesn't serve docs.`, params: { extension: input.extension } });
  }
  const page = pageAnswerSchema.safeParse(await ctx.exec(`${documented.namespace}.docs.get`, { topic: input.topic }));
  if (!page.success) throw invalid(invalidAnswer(documented, 'docs.get', 'a page').message, { extension: documented.name, topic: input.topic });
  return { extension: documented.name, ...page.data };
}
