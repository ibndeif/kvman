import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { todo, useKvcoder, type FixtureExtension } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, textOf } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// A command that answers images (08 §8.4, ADR 0115, 47): `make` has `images: true`, `plain` doesn't.
const shotsEntry = `import { z, type Ctx } from '@kvman/sdk';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

export default (ctx: Ctx): void => {
  const make = async (kind: string) => {
    if (kind === 'text') return [await ctx.files.write('a.txt', 'hi', 'text/plain')];
    if (kind === 'big') return [await ctx.files.write('big.png', Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png')];
    if (kind === 'missing') return [{ id: 'nope' }];
    const count = kind === 'nine' ? 9 : 2;
    const made = [];
    for (let index = 0; index < count; index += 1) made.push(await ctx.files.write('shot-' + String(index + 1) + '.png', png, 'image/png'));
    return made;
  };
  const handle = async ({ kind }: { kind: string }) => ({ made: kind, images: (await make(kind)).map((file) => ({ fileId: file.id, name: 'shot.png' })) });
  ctx.registerCommand('shots.sheet.make', { description: 'Makes images.', input: z.object({ kind: z.string() }), output: z.json(), public: true, handle });
  ctx.registerCommand('shots.sheet.plain', { description: 'Makes images, as JSON.', input: z.object({ kind: z.string() }), output: z.json(), public: true, handle });
  ctx.registerHandler('kernel.started', {
    description: 'Registers the shots connector.',
    handle: async () => {
      await ctx.exec('kvcoder.connector.register', { name: 'shots', description: 'Shots.', commands: [{ name: 'make', command: 'shots.sheet.make', images: true }, { name: 'plain', command: 'shots.sheet.plain' }] });
    },
  });
};
`;

const shots: FixtureExtension = { name: '@test/shots', namespace: 'shots', entry: shotsEntry, dependencies: { '@kvman/kvcoder': '^0.1.0' } };

const imageUrls = (fake: FakeOpenAI): string[] =>
  requestMessages(fake).flatMap((message) => (Array.isArray(message.content) ? message.content : [])).flatMap((part) => {
    const parsed = z.object({ type: z.literal('image_url'), image_url: z.object({ url: z.string() }) }).safeParse(part);
    return parsed.success ? [parsed.data.image_url.url] : [];
  });

const toolText = (fake: FakeOpenAI): string => requestMessages(fake).filter((message) => message.role === 'tool').map((message) => textOf(message)).join('\n');

async function ask(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, name: string, kind: string): Promise<void> {
  fake.reply(runs(command('shots', name, { kind })), says('done'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
}

describe('images for the model (08 §8.4, ADR 0115, 47)', { timeout: 30_000 }, () => {
  it('M5.9-H1 a model that takes images gets them after the text; one that does not is told; the details keep them', async () => {
    const { kernel, fake } = await kvcoder.start({ extensions: [todo, shots] });
    const sessionId = await newSession(kernel);
    await ask(kernel, fake, sessionId, 'make', 'two');
    expect(imageUrls(fake)).toHaveLength(2);
    expect(imageUrls(fake)[0]).toMatch(/^data:image\/png;base64,/);
    const listed = await kernel.exec('kvcoder.message.list', { sessionId, limit: 20 });
    const details = listed.messages.map((message) => z.object({ kind: z.literal('toolResult'), content: z.object({ details: z.object({ images: z.array(z.object({ fileId: z.string(), name: z.string() })) }) }).loose() }).loose().safeParse(message)).find((parsed) => parsed.success);
    expect(details?.data?.content.details.images).toHaveLength(2);

    const textOnly = await newSession(kernel);
    await kernel.exec('kvcoder.session.configure', { sessionId: textOnly, model: 'fake/m2' });
    await ask(kernel, fake, textOnly, 'make', 'two');
    expect(imageUrls(fake)).toEqual([]);
    expect(toolText(fake)).toContain("[2 images not shown: this model doesn't take images]");
  });

  it('M5.9-E1 nine images, a text file, a PNG over 5 MiB, or no file fail the call; no image is sent', async () => {
    const { kernel, fake } = await kvcoder.start({ extensions: [todo, shots] });
    for (const kind of ['nine', 'text', 'big', 'missing']) {
      const sessionId = await newSession(kernel);
      await ask(kernel, fake, sessionId, 'make', kind);
      expect(toolText(fake)).toMatch(/^error VALIDATION_FAILED: /);
      expect(imageUrls(fake)).toEqual([]);
    }
  });

  it('M5.9-E2 a cleared result loses its images', async () => {
    const { kernel, fake } = await kvcoder.start({ extensions: [todo, shots] });
    const sessionId = await newSession(kernel);
    await ask(kernel, fake, sessionId, 'make', 'two');
    const database = new DatabaseSync(path.join(kernel.home, 'kvman.db'));
    try {
      database.prepare("UPDATE store_documents SET data = json_set(data, '$.clearedThroughSeq', 1000) WHERE extension = '@kvman/kvcoder' AND collection = 'sessions'").run();
    } finally {
      database.close();
    }
    fake.reply(says('again'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    expect(imageUrls(fake)).toEqual([]);
    expect(toolText(fake)).toContain('[cleared to save memory:');
  });

  it('M5.9-E3 images from a command without images: true stay plain JSON', async () => {
    const { kernel, fake } = await kvcoder.start({ extensions: [todo, shots] });
    const sessionId = await newSession(kernel);
    await ask(kernel, fake, sessionId, 'plain', 'two');
    expect(imageUrls(fake)).toEqual([]);
    expect(toolText(fake)).toContain('"images":[{"fileId":');
    const listed = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'shots');
    expect(listed?.commands?.map((entry) => [entry.name, entry.images])).toEqual([
      ['make', true],
      ['plain', undefined],
    ]);
  });
});
