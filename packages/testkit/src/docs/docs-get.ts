import { ProblemError, extensionInfoSchema, z } from '@kvman/sdk';
import { readBuiltInGuide } from './built-in-guides.ts';
import { callQuery } from '../running/call-query.ts';
import { KvmanUnreachableError, type RunningKvman } from '../running/running-kvman.ts';
import { BinFailure } from '../bin/bin-failure.ts';

// `kvman-docs get` (plan 09 §9.5): `kvman` reads a built-in guide; anything else asks the running kvman, which must
// have the extension loaded with both `<namespace>.docs.list` and `<namespace>.docs.get` as public queries.

/** A docs page. */
export type DocsPage = { extension: string; topic: string; title: string; markdown: string };

const docsPageSchema = z.strictObject({ topic: z.string(), title: z.string(), markdown: z.string() });
const extensionsListSchema = z.array(extensionInfoSchema);

function notRunning(extension: string): BinFailure {
  return new BinFailure('NOT_RUNNING', `kvman isn't running; start it to read ${extension}'s docs.`);
}

/** Reads one docs page. */
export async function readDocsPage(running: RunningKvman | undefined, extension: string, topic: string): Promise<DocsPage> {
  if (extension === 'kvman') {
    const guide = readBuiltInGuide(topic);
    if (guide === undefined) throw new BinFailure('NOT_FOUND', `kvman has no guide on ${topic}.`);
    return { extension: guide.extension, topic: guide.topic, title: guide.title, markdown: guide.markdown };
  }
  if (running === undefined) throw notRunning(extension);
  let extensions: z.output<typeof extensionsListSchema>;
  try {
    extensions = await callQuery(running, 'kernel.extensions.list', {}, extensionsListSchema);
  } catch (error) {
    if (error instanceof KvmanUnreachableError) throw notRunning(extension);
    throw error;
  }
  const documented = extensions.find((entry) => entry.name === extension);
  if (documented === undefined) throw new BinFailure('NOT_FOUND', `${extension} isn't loaded or doesn't serve docs.`);
  const servesDocs = [`${documented.namespace}.docs.list`, `${documented.namespace}.docs.get`].every((wanted) =>
    documented.queries.some((query) => query.name === wanted && query.public),
  );
  if (!servesDocs) throw new BinFailure('NOT_FOUND', `${extension} isn't loaded or doesn't serve docs.`);
  const namespace = documented.namespace;
  try {
    const page = await callQuery(running, `${namespace}.docs.get`, { topic }, docsPageSchema);
    return { extension, topic: page.topic, title: page.title, markdown: page.markdown };
  } catch (error) {
    if (error instanceof KvmanUnreachableError) throw notRunning(extension);
    if (error instanceof ProblemError && (error.problem.code === 'NOT_FOUND' || error.problem.code.endsWith('/NOT_FOUND'))) {
      throw new BinFailure('NOT_FOUND', error.problem.message);
    }
    if (error instanceof ProblemError) throw new Error(`${error.problem.code}: ${error.problem.message}`);
    if (error instanceof z.ZodError) throw new Error(`${namespace}.docs.get answered something other than a page.`);
    throw error;
  }
}
