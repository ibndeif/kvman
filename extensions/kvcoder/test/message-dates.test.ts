import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { messageStamp } from '../src/turns/message-stamp.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, shell, systemPrompt, textOf } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');

// The stamp of a stored message, at this computer's offset for that time, as kvcoder sends it.
const stampOf = (createdAt: string): string => messageStamp(createdAt, -new Date(createdAt).getTimezoneOffset());

async function personMessages(kernel: TestKernel, sessionId: string) {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return messages.filter((message) => message.kind === 'user');
}

const userTexts = (messages: ReturnType<typeof requestMessages>): string[] => messages.filter((message) => message.role === 'user').map(textOf);

describe("the date on a person's message (08 §8.2, ADR 0032, 1, 5, and 6)", { timeout: 30_000 }, () => {
  it('QA44-H1 a message of the person reaches the model with its date, and is stored without it', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'hello' });
    await kernel.clock.advance(0);
    const [stored] = await personMessages(kernel, sessionId);
    expect(stored?.content['content']).toBe('hello');
    expect(userTexts(requestMessages(fake))).toEqual([`${stampOf(stored?.createdAt ?? '')}\nhello`]);
  });

  it('QA44-H2 a later step and a later turn send the same text again', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell('echo one')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'first' });
    await kernel.clock.advance(0);
    const [firstStep] = userTexts(requestMessages(fake, 0));
    expect(userTexts(requestMessages(fake, 1))).toEqual([firstStep]);
    fake.reply(says('later'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'second' });
    await kernel.clock.advance(0);
    const stored = await personMessages(kernel, sessionId);
    const stamps = stored.map((message) => stampOf(message.createdAt));
    expect(userTexts(requestMessages(fake))).toEqual([firstStep, `${stamps[1] ?? ''}\nsecond`]);
    expect(firstStep).toBe(`${stamps[0] ?? ''}\nfirst`);
  });

  it('QA44-H3 the base prompt says what the stamp is, after the reply-language line', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'hello' });
    await kernel.clock.advance(0);
    expect(systemPrompt(fake)).toContain(
      'Reply in English (en) unless the person writes in another language.\nEach message from the person starts with the date and time it was sent, in brackets; the newest one is the current time.\n',
    );
  });

  it("QA44-E1 a subagent's task, which isn't the person's message, has no stamp", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'general', task: 'Check it' })), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(3), wait);
    const [stored] = await personMessages(kernel, sessionId);
    expect(userTexts(requestMessages(fake, 0))).toEqual([`${stampOf(stored?.createdAt ?? '')}\ngo`]);
    expect(userTexts(requestMessages(fake, 1))).toEqual(['Check it']);
  });

  it('QA44-E2 a message with an image has the stamp in its text, then the image', async () => {
    const { kernel, fake } = await kvcoder.start();
    const fileId = z.object({ id: z.string() }).parse(await kernel.exec('todo.file.write', { name: 'shot.png', base64: png, type: 'image/png' }, { as: '@test/todo' })).id;
    const sessionId = await newSession(kernel);
    fake.reply(says('I see it'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'look', fileIds: [fileId] });
    await kernel.clock.advance(0);
    const [stored] = await personMessages(kernel, sessionId);
    const user = requestMessages(fake).find((message) => message.role === 'user');
    expect(user?.content).toEqual([
      { type: 'text', text: `${stampOf(stored?.createdAt ?? '')}\nlook` },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } },
    ]);
  });
});
