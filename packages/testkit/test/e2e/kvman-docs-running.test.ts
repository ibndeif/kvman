import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { repositoryRoot } from '../support/npm-mirror.ts';
import { runBin, type BinRun } from '../support/run-bin.ts';
import { writeDocsFixtures, writeDocsPreset } from '../support/docs-fixtures.ts';
import { startKvman, useDocsSandbox, type StartedKvman } from '../support/kvman-child.ts';

const makeSandbox = useDocsSandbox();

async function startDocsKvman(): Promise<StartedKvman> {
  const sandbox = makeSandbox();
  const extensions = writeDocsFixtures(path.join(sandbox.root, 'fixtures'));
  const preset = writeDocsPreset(sandbox.root, extensions);
  return startKvman(sandbox, ['--preset', preset]);
}

function docsBin(running: StartedKvman, args: readonly string[]): Promise<BinRun> {
  return runBin('docs/docs-bin.js', [...args, '--home', running.home], { cwd: running.home });
}

const failureSchema = z.object({ code: z.string(), message: z.string() });

function failureOf(run: BinRun): { code: string; message: string } {
  expect(run.exitCode).toBe(1);
  expect(run.stdout).toBe('');
  expect(run.stderr.trim().split('\n')).toHaveLength(1);
  return failureSchema.parse(JSON.parse(run.stderr));
}

const builtInPages = [
  { extension: 'kvman', topic: 'conventions', title: 'Conventions' },
  { extension: 'kvman', topic: 'i18n', title: 'Texts and languages' },
  { extension: 'kvman', topic: 'presets', title: 'Presets' },
  { extension: 'kvman', topic: 'sdk', title: 'The extension API (`@kvman/sdk`)' },
];

const okPages = [
  { extension: '@fix/ok', topic: 'settings', title: 'Ok settings' },
  { extension: '@fix/ok', topic: 'usage', title: 'Using ok' },
];

const expectedProblems = [
  { extension: '@fix/badshape', problem: { code: 'VALIDATION_FAILED', message: 'badshape.docs.list answered something other than a list of pages.' } },
  { extension: '@fix/listbroken', problem: { code: 'HANDLER_FAILED', message: 'The handler of listbroken.docs.list failed.' } },
];

const expectedHuman = [
  'kvman',
  '  conventions: Conventions',
  '  i18n: Texts and languages',
  '  presets: Presets',
  '  sdk: The extension API (`@kvman/sdk`)',
  '@fix/ok',
  '  settings: Ok settings',
  '  usage: Using ok',
  'Problems:',
  '@fix/badshape: badshape.docs.list answered something other than a list of pages.',
  '@fix/listbroken: The handler of listbroken.docs.list failed.',
  '',
].join('\n');

const okUsageMarkdown = '# Using ok\n\nThe Using ok page.\n';

describe('kvman-docs against a running kvman (09 §9.5, ADR 0010, 17)', () => {
  it('QA17-H26 list --json prints the built-in guides, the healthy extension, and one problem per broken extension', async () => {
    const running = await startDocsKvman();
    const run = await docsBin(running, ['list', '--json']);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toBe('');
    expect(run.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(run.stdout)).toEqual({ pages: [...builtInPages, ...okPages], problems: expectedProblems });
  });

  it('QA17-H26 list prints the groups and a Problems section', async () => {
    const running = await startDocsKvman();
    const run = await docsBin(running, ['list']);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(expectedHuman);
  });

  it('QA17-H26 get prints the extension page as Markdown, or as JSON with --json', async () => {
    const running = await startDocsKvman();
    const human = await docsBin(running, ['get', '@fix/ok', 'usage']);
    expect(human.exitCode).toBe(0);
    expect(human.stderr).toBe('');
    expect(human.stdout).toBe(`${okUsageMarkdown}\n`);
    const json = await docsBin(running, ['get', '@fix/ok', 'usage', '--json']);
    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe('');
    expect(json.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(json.stdout)).toEqual({ extension: '@fix/ok', topic: 'usage', title: 'Using ok', markdown: okUsageMarkdown });
  });

  it('QA17-H26 get kvman sdk prints the testkit page', async () => {
    const running = await startDocsKvman();
    const markdown = readFileSync(path.join(repositoryRoot, 'packages/testkit/docs/sdk.md'), 'utf8');
    const human = await docsBin(running, ['get', 'kvman', 'sdk']);
    expect(human.exitCode).toBe(0);
    expect(human.stderr).toBe('');
    expect(human.stdout).toBe(`${markdown}\n`);
    const json = await docsBin(running, ['get', 'kvman', 'sdk', '--json']);
    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual({ extension: 'kvman', topic: 'sdk', title: 'The extension API (`@kvman/sdk`)', markdown });
  });

  it('QA17-H26 --url reaches kvman with the lock file elsewhere', async () => {
    const running = await startDocsKvman();
    const empty = path.join(running.home, 'empty');
    mkdirSync(empty, { recursive: true });
    const run = await runBin('docs/docs-bin.js', ['list', '--home', empty, '--url', `http://127.0.0.1:${String(running.port)}`], { cwd: running.home });
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toBe('');
    expect(run.stdout).toBe(expectedHuman);
  });

  it('QA17-H26 get of a topic the extension does not serve fails NOT_FOUND', async () => {
    const running = await startDocsKvman();
    const run = await docsBin(running, ['get', '@fix/ok', 'nope', '--json']);
    expect(failureOf(run)).toEqual({ code: 'NOT_FOUND', message: 'okdocs has no docs on nope.' });
  });

  it('QA17-H26 get of a private, half-documented, or unknown extension fails NOT_FOUND', async () => {
    const running = await startDocsKvman();
    for (const extension of ['@fix/private', '@fix/half', '@fix/gone']) {
      const run = await docsBin(running, ['get', extension, 'usage', '--json']);
      expect(failureOf(run).code).toBe('NOT_FOUND');
    }
  });

  it('QA17-H26 get of an unknown built-in guide fails NOT_FOUND', async () => {
    const running = await startDocsKvman();
    const run = await docsBin(running, ['get', 'kvman', 'nope', '--json']);
    expect(failureOf(run).code).toBe('NOT_FOUND');
  });
});
