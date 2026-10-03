import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkExtension } from '../../src/check/check-extension.ts';
import { cleanSource, useProjects } from './projects.ts';

const project = useProjects();
const binFile = fileURLToPath(new URL('../../src/check-bin.ts', import.meta.url));

// Projects that serve docs, built on the clean extension: `docs.list` answers `listHandle`, `docs.get` answers
// `getHandle`, each overridable per case (`access` empty makes the query private, `z.json()` lets a wrong shape
// through the kernel so the check sees it).

const listQuery = (handle: string, access = 'public: true, ', output = 'z.array(z.object({ topic: z.string(), title: z.string() }))'): string =>
  `ctx.registerQuery('notes.docs.list', { description: 'Lists the docs pages.', ${access}input: z.object({}), output: ${output}, handle: ${handle} });`;

const getQuery = (handle: string, access = 'public: true, ', output = 'z.object({ topic: z.string(), title: z.string(), markdown: z.string() })'): string =>
  `ctx.registerQuery('notes.docs.get', { description: 'Reads one docs page.', ${access}input: z.object({ topic: z.string().describe('The page topic.') }), output: ${output}, handle: ${handle} });`;

function docsSource(...queries: string[]): string {
  return cleanSource.replace('};\n', `  ${queries.join('\n  ')}\n};\n`);
}

function throwing(source: string): string {
  return source.replace('import { z, type Ctx }', 'import { ProblemError, z, type Ctx }');
}

const healthyGet = getQuery('(input) => ({ topic: input.topic, title: input.topic, markdown: `# ${input.topic}\\n` })');
const usageList = listQuery(`() => [{ topic: 'usage', title: 'Using notes' }]`);

describe('kvman-check docs pair (09 §9.5)', () => {
  it('QA17-E30 no docs queries is no docs finding', async () => {
    expect(await checkExtension(project({ source: cleanSource }))).toEqual([]);
  });

  it('QA17-E30 only docs.list warns', async () => {
    const findings = await checkExtension(project({ source: docsSource(usageList) }));
    expect(findings).toEqual([
      {
        message: "Only notes.docs.list is registered; kvcustomizer and kvman-docs show an extension's docs only when it has both notes.docs.list and notes.docs.get.",
        hint: 'Register the other as a public query, or remove this one.',
        warning: true,
      },
    ]);
  });

  it('QA17-E30 only docs.get warns', async () => {
    const findings = await checkExtension(project({ source: docsSource(healthyGet) }));
    expect(findings).toEqual([
      {
        message: "Only notes.docs.get is registered; kvcustomizer and kvman-docs show an extension's docs only when it has both notes.docs.list and notes.docs.get.",
        hint: 'Register the other as a public query, or remove this one.',
        warning: true,
      },
    ]);
  });

  it('QA17-E30 a private docs query warns', async () => {
    const findings = await checkExtension(project({ source: docsSource(listQuery(`() => [{ topic: 'usage', title: 'Using notes' }]`, ''), healthyGet) }));
    expect(findings).toEqual([
      { message: "notes.docs.list isn't public, so kvcustomizer and kvman-docs can't read it.", hint: 'Add public: true to its registration.', warning: true },
    ]);
  });

  it('QA17-E30 a healthy pair is quiet', async () => {
    const source = docsSource(listQuery(`() => [{ topic: 'getting-started', title: 'Getting started' }]`), healthyGet);
    expect(await checkExtension(project({ source }))).toEqual([]);
  });

  it('QA17-E30 a topic outside kebab-case warns', async () => {
    const source = docsSource(listQuery(`() => [{ topic: 'Bad_Topic', title: 'Bad' }]`), healthyGet);
    expect(await checkExtension(project({ source }))).toEqual([
      {
        message: 'The docs topic "Bad_Topic" isn\'t a lowercase kebab-case segment.',
        hint: 'Use lowercase letters, digits, and single hyphens, such as getting-started.',
        warning: true,
      },
    ]);
  });

  it('QA17-E30 a topic docs.get fails warns', async () => {
    const source = throwing(docsSource(listQuery(`() => [{ topic: 'missing', title: 'Missing' }]`), getQuery(`() => { throw new ProblemError({ code: 'notes/NOT_FOUND', message: 'No page missing.' }); }`)));
    expect(await checkExtension(project({ source }))).toEqual([
      {
        message: 'notes.docs.get fails for the topic "missing" with notes/NOT_FOUND: No page missing.',
        hint: 'Every topic that docs.list answers must be answered by docs.get.',
        warning: true,
      },
    ]);
  });

  it('QA17-E30 a failing docs.list warns', async () => {
    const source = throwing(docsSource(listQuery(`() => { throw new ProblemError({ code: 'notes/DOCS_FAILED', message: 'Docs broke.' }); }`), healthyGet));
    expect(await checkExtension(project({ source }))).toEqual([
      { message: 'notes.docs.list fails with notes/DOCS_FAILED: Docs broke.', hint: 'docs.list must answer [{ topic, title }].', warning: true },
    ]);
  });

  it('QA17-E30 a misshapen docs.list warns', async () => {
    const source = docsSource(listQuery(`() => ({ not: 'a list' })`, 'public: true, ', 'z.json()'), healthyGet);
    expect(await checkExtension(project({ source }))).toEqual([
      { message: 'notes.docs.list answers something other than [{ topic, title }].', hint: 'docs.list must answer [{ topic, title }].', warning: true },
    ]);
  });

  it('QA17-E30 a misshapen docs.get warns', async () => {
    const source = docsSource(usageList, getQuery('(input) => ({ topic: input.topic })', 'public: true, ', 'z.json()'));
    expect(await checkExtension(project({ source }))).toEqual([
      {
        message: 'notes.docs.get answers something other than { topic, title, markdown } for "usage".',
        hint: 'Every topic that docs.list answers must be answered by docs.get.',
        warning: true,
      },
    ]);
  });

  it('QA17-E30 warnings exit 0', async () => {
    const folder = project({ source: docsSource(usageList) });
    const run = spawnSync(process.execPath, ['--conditions=@kvman/source', binFile, '--json'], { cwd: folder, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("Only notes.docs.list is registered;");
  });
});
