import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { writeDocsFixtures } from './support/docs-fixtures.ts';
import { useKvbuilder } from './support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const testkitDocs = fileURLToPath(new URL('../../../packages/testkit/docs/', import.meta.url));
const builtIn = ['conventions', 'i18n', 'presets', 'sdk'];
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });

async function start() {
  const root = mkdtempSync(path.join(tmpdir(), 'kvbuilder-docs-'));
  roots.push(root);
  return kvbuilder.start({}, writeDocsFixtures(root));
}

describe('the docs connector pulls every extension\'s pages (09 §9.1 and §9.5, ADR 0010, 15–17 and 22)', { timeout: 60_000 }, () => {
  it('QA17-H16 guides.list gives the built-in guides, then each documenting extension, and guides.get reads them', async () => {
    const { kernel } = await start();
    const { pages } = await kernel.exec('kvbuilder.guides.list', {});
    const titleOf = (topic: string) => (readFileSync(`${testkitDocs}${topic}.md`, 'utf8').split('\n').find((line) => line.startsWith('# ')) ?? '').slice(2);
    expect(pages.slice(0, builtIn.length)).toEqual(builtIn.map((topic) => ({ extension: 'kvman', topic, title: titleOf(topic) })));
    expect(pages.filter((page) => page.extension === '@fix/ok')).toEqual([
      { extension: '@fix/ok', topic: 'usage', title: 'Using ok' },
      { extension: '@fix/ok', topic: 'settings', title: 'Ok settings' },
    ]);
    expect(pages.filter((page) => page.extension === '@kvman/kvbuilder').map((page) => page.topic)).toEqual(['building']);
    for (const topic of builtIn) {
      const expected = readFileSync(`${testkitDocs}${topic}.md`, 'utf8');
      expect(await kernel.exec('kvbuilder.guides.get', { topic })).toMatchObject({ extension: 'kvman', topic, markdown: expected });
      expect(await kernel.exec('kvbuilder.guides.get', { extension: 'kvman', topic })).toMatchObject({ markdown: expected });
    }
    expect(await kernel.exec('kvbuilder.guides.get', { extension: '@fix/ok', topic: 'usage' })).toEqual({
      extension: '@fix/ok',
      topic: 'usage',
      title: 'Using ok',
      markdown: '# Using ok\n\nBody of usage.\n',
    });
  });

  it('QA42-H19 guides.list starts with the four built-in guides, and guides.get answers conventions', async () => {
    const { kernel } = await start();
    const { pages } = await kernel.exec('kvbuilder.guides.list', {});
    expect(pages.slice(0, 4).map((page) => [page.extension, page.topic])).toEqual([
      ['kvman', 'conventions'],
      ['kvman', 'i18n'],
      ['kvman', 'presets'],
      ['kvman', 'sdk'],
    ]);
    const markdown = readFileSync(`${testkitDocs}conventions.md`, 'utf8');
    expect(await kernel.exec('kvbuilder.guides.get', { topic: 'conventions' })).toEqual({ extension: 'kvman', topic: 'conventions', title: 'Conventions', markdown });
  });

  it('QA17-E25 one failing extension hides no other, and its Problem leaks nothing', async () => {
    const { kernel } = await start();
    const { pages, problems } = await kernel.exec('kvbuilder.guides.list', {});
    expect(pages.some((page) => page.extension === '@fix/ok')).toBe(true);
    expect(problems.map((entry) => entry.extension)).toEqual(['@fix/badshape', '@fix/listbroken']);
    const [badshape, listbroken] = problems;
    expect(badshape?.problem).toMatchObject({ code: 'VALIDATION_FAILED', message: expect.stringContaining('badshape.docs.list') });
    expect(listbroken?.problem.code).toBe('HANDLER_FAILED');
    expect(JSON.stringify(problems)).not.toContain('secret detail');
    expect(JSON.stringify(problems)).not.toContain('stack');
  });

  it('QA17-E26 only a documented extension counts, and two may serve one topic name', async () => {
    const { kernel } = await start();
    const { pages, problems } = await kernel.exec('kvbuilder.guides.list', {});
    const listed = new Set(pages.map((page) => page.extension));
    for (const name of ['@fix/private', '@fix/half']) expect(listed.has(name), name).toBe(false);
    expect(problems.map((entry) => entry.extension)).not.toContain('@fix/private');
    expect(problems.map((entry) => entry.extension)).not.toContain('@fix/half');
    const topics = pages.filter((page) => page.topic === 'usage' || page.topic === 'settings');
    expect(topics.map((page) => page.extension)).toEqual(['@fix/ok', '@fix/ok']);
  });

  it('QA17-E27 guides.get fails clearly for what is missing and for what is not a topic', async () => {
    const { kernel } = await start();
    await expect(kernel.exec('kvbuilder.guides.get', { extension: '@fix/gone', topic: 'usage' })).rejects.toEqual(failed('NOT_FOUND'));
    await expect(kernel.exec('kvbuilder.guides.get', { extension: '@fix/private', topic: 'x' })).rejects.toEqual(failed('NOT_FOUND'));
    await expect(kernel.exec('kvbuilder.guides.get', { extension: '@fix/ok', topic: 'nope' })).rejects.toEqual(failed('NOT_FOUND'));
    await expect(kernel.exec('kvbuilder.guides.get', { topic: 'views' })).rejects.toEqual(failed('NOT_FOUND'));
    await expect(kernel.exec('kvbuilder.guides.get', { extension: 'kvman', topic: 'nope' })).rejects.toEqual(failed('NOT_FOUND'));
    for (const topic of ['../x', 'Bad_Topic', '']) {
      await expect(kernel.exec('kvbuilder.guides.get', { topic }), topic).rejects.toEqual(failed('VALIDATION_FAILED'));
    }
    await expect(kernel.exec('kvbuilder.guides.get', { extension: '@fix/badshape', topic: 'x' })).rejects.toEqual(failed('VALIDATION_FAILED'));
  });
});
