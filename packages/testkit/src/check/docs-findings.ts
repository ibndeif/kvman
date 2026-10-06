import { ProblemError, z } from '@kvman/sdk';
import type { TestKernel } from '../index.ts';
import type { CheckedFinding } from './finding.ts';

// The docs-pair warnings (plan 09 §9.5, QA17-E30): an extension's docs reach kvbuilder and `kvman-docs` only
// through both `<namespace>.docs.list` and `<namespace>.docs.get` as public queries, so a half-done or wrong pair
// warns instead of silently hiding the pages. Every finding here is a warning.

const listAnswerSchema = z.array(z.object({ topic: z.string(), title: z.string() }));

const pageAnswerSchema = z.object({ topic: z.string(), title: z.string(), markdown: z.string() });

const topicPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function docsWarning(message: string, hint: string): CheckedFinding {
  return { message, hint, warning: true };
}

async function answeredFindings(kernel: TestKernel, list: string, get: string): Promise<CheckedFinding[]> {
  let answer: unknown;
  try {
    answer = await kernel.exec(list, {});
  } catch (error) {
    if (error instanceof ProblemError) return [docsWarning(`${list} fails with ${error.problem.code}: ${error.problem.message}`, 'docs.list must answer [{ topic, title }].')];
    throw error;
  }
  const listed = listAnswerSchema.safeParse(answer);
  if (!listed.success) return [docsWarning(`${list} answers something other than [{ topic, title }].`, 'docs.list must answer [{ topic, title }].')];
  const findings: CheckedFinding[] = [];
  for (const entry of listed.data) {
    if (!topicPattern.test(entry.topic)) {
      findings.push(docsWarning(`The docs topic "${entry.topic}" isn't a lowercase kebab-case segment.`, 'Use lowercase letters, digits, and single hyphens, such as getting-started.'));
      continue;
    }
    let page: unknown;
    try {
      page = await kernel.exec(get, { topic: entry.topic });
    } catch (error) {
      if (error instanceof ProblemError) {
        findings.push(docsWarning(`${get} fails for the topic "${entry.topic}" with ${error.problem.code}: ${error.problem.message}`, 'Every topic that docs.list answers must be answered by docs.get.'));
        continue;
      }
      throw error;
    }
    if (!pageAnswerSchema.safeParse(page).success) {
      findings.push(docsWarning(`${get} answers something other than { topic, title, markdown } for "${entry.topic}".`, 'Every topic that docs.list answers must be answered by docs.get.'));
    }
  }
  return findings;
}

/** The docs-pair warnings of the extension's `queries` (plan 09 §9.5): none when neither query is registered. */
export async function docsFindings(kernel: TestKernel, namespace: string, queries: readonly { name: string; public: boolean }[]): Promise<CheckedFinding[]> {
  const list = `${namespace}.docs.list`;
  const get = `${namespace}.docs.get`;
  const hasList = queries.some((query) => query.name === list);
  const hasGet = queries.some((query) => query.name === get);
  if (!hasList && !hasGet) return [];
  if (!hasList || !hasGet) {
    const only = hasList ? list : get;
    return [docsWarning(`Only ${only} is registered; kvbuilder and kvman-docs show an extension's docs only when it has both ${list} and ${get}.`, 'Register the other as a public query, or remove this one.')];
  }
  const privateOnes = [list, get].filter((name) => !queries.some((query) => query.name === name && query.public));
  if (privateOnes.length > 0) {
    return privateOnes.map((name) => docsWarning(`${name} isn't public, so kvbuilder and kvman-docs can't read it.`, 'Add public: true to its registration.'));
  }
  return answeredFindings(kernel, list, get);
}
