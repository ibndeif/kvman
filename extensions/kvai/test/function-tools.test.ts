import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvai } from './support/kvai-kernel.ts';

const kvai = useKvai();

const repository = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const developers = path.join(repository, 'docs', 'developers');
const guide = readFileSync(path.join(developers, 'agents-and-tools.md'), 'utf8');

// The extension the guide prints under "The whole extension": its first TypeScript block.
const example = /## The whole extension[\s\S]*?```ts\n([\s\S]*?)```/.exec(guide)?.[1] ?? '';

const requestSchema = z.object({ messages: z.array(z.object({ role: z.string(), content: z.unknown().optional() })), tools: z.array(z.object({ function: z.object({ name: z.string(), parameters: z.object({ properties: z.record(z.string(), z.unknown()) }) }) })) });
const extensionsSchema = z.array(z.object({ name: z.string(), commands: z.array(z.object({ name: z.string() })), queries: z.array(z.object({ name: z.string() })) }));

describe('the function-tools guide (ADR 0011, 14)', { timeout: 30_000 }, () => {
  it("QA18-H23 the guide's example extension runs its calculate function inside its handler, with no job behind the tool", async () => {
    expect(example).toContain("ctx.registerCommand('calc.question.answer'");
    const { kernel, fake } = await kvai.start({ settings: { 'kvai.defaultModel': 'fake/m1' } }, [{ name: '@docs/calc', namespace: 'calc', entry: example }]);
    fake.reply({ chunks: [{ toolCall: { id: 'c1', name: 'calculate', arguments: { a: 3, b: 4 } } }] }, { chunks: [{ text: '7' }] });
    expect(await kernel.exec('calc.question.answer', { question: 'add 3 and 4' })).toEqual({ answer: '7' });

    const [first, second] = fake.requests().map((request) => requestSchema.parse(request.body));
    expect(first?.tools.map((offered) => offered.function.name)).toEqual(['calculate']);
    expect(Object.keys(first?.tools[0]?.function.parameters.properties ?? {})).toEqual(['a', 'b']);
    expect(JSON.stringify(second?.messages.find((message) => message.role === 'tool')?.content)).toContain('{\\"sum\\":7}');

    const calc = extensionsSchema.parse(await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@docs/calc');
    expect(calc?.commands.map((command) => command.name)).toEqual(['calc.question.answer']);
    expect(calc?.queries).toEqual([]);
    expect((await kernel.exec('kernel.jobs.list', { limit: 100 })).filter((job) => job.name.startsWith('calc.'))).toEqual([]);

    fake.reply({ chunks: [{ toolCall: { id: 'c2', name: 'calculate', arguments: { a: 'three', b: 4 } } }] }, { chunks: [{ text: 'I need numbers.' }] });
    expect(await kernel.exec('calc.question.answer', { question: 'add three and 4' })).toEqual({ answer: 'I need numbers.' });

    for (const page of ['README.md', 'sdk.md', 'connectors.md']) expect(readFileSync(path.join(developers, page), 'utf8'), page).toContain('(agents-and-tools.md)');
  });
});
