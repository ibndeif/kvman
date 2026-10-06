import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { useKvbuilder } from './support/kvbuilder-kernel.ts';

const kvbuilder = useKvbuilder();
const docsFolder = fileURLToPath(new URL('../docs/', import.meta.url));
const testkitPackage = fileURLToPath(new URL('../../../packages/testkit/package.json', import.meta.url));
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });

describe("kvbuilder's own docs pair (09 §9.5, ADR 0010, 22)", { timeout: 30_000 }, () => {
  it('QA17-H25 docs.list answers customizing, docs.get its file, both public, and the page keeps its promises', async () => {
    const { kernel } = await kvbuilder.start();
    const markdown = readFileSync(path.join(docsFolder, 'customizing.md'), 'utf8');
    expect(await kernel.exec('kvbuilder.docs.list', {})).toEqual([{ topic: 'customizing', title: 'Customizing kvman' }]);
    expect(markdown).toContain('| `kvman` | `init`, `model-list`');
    expect(markdown).toContain("## Talking with a person who isn't a developer");
    expect(await kernel.exec('kvbuilder.docs.get', { topic: 'customizing' })).toEqual({ topic: 'customizing', title: 'Customizing kvman', markdown });
    for (const topic of ['nope', '../x', 'section', 'init']) await expect(kernel.exec('kvbuilder.docs.get', { topic }), topic).rejects.toEqual(failed('NOT_FOUND'));
    const extension = (await kernel.exec('kernel.extensions.list', {})).find((candidate) => candidate.name === '@kvman/kvbuilder');
    for (const name of ['kvbuilder.docs.list', 'kvbuilder.docs.get', 'kvbuilder.guides.list', 'kvbuilder.guides.get']) {
      expect(extension?.queries.find((query) => query.name === name)?.public, name).toBe(true);
    }
    for (const link of [...markdown.matchAll(/\]\((?!https?:|#)([^)#\s]+)/g)].map((match) => match[1] ?? '')) {
      expect(existsSync(path.join(docsFolder, link)), link).toBe(true);
    }
    const connectors = (await kernel.exec('kvcoder.connector.list', {})).filter((connector) => connector.owner === '@kvman/kvbuilder').map((connector) => connector.name);
    for (const word of ['kvman', 'ext', 'preset', 'preview', 'docs']) expect(connectors, word).toContain(word);
    const bins = Object.keys((JSON.parse(readFileSync(testkitPackage, 'utf8')) as { bin: Record<string, string> }).bin);
    for (const bin of markdown.match(/kvman-[a-z]+/g) ?? []) expect(bins, bin).toContain(bin);
  });
});
