import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fsCall, requestMessages, runs, says, textOf, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// Old tool results cleared in what the model is sent (08 §8.1, ADR 0094, 1).
const stub = (file: string): string => `[cleared to save memory: fs read ${file}. Make the call again if you need it.]`;
const bigFiles = (count: number) => (folder: string): void => {
  for (let index = 0; index < count; index += 1) writeFileSync(path.join(folder, `big-${String(index)}.txt`), `${'x'.repeat(99)}\n`.repeat(400));
};
const reads = (count: number) => runs(...Array.from({ length: count }, (_read, index) => fsCall('read', { path: `big-${String(index)}.txt` })));
const toolTexts = (fake: Parameters<typeof requestMessages>[0], index: number): string[] => requestMessages(fake, index).filter((message) => message.role === 'tool').map((message) => textOf(message));

// The chat's replies, moved two hours back, as if the person came back later.
function ageReplies(kernel: TestKernel): void {
  const database = new DatabaseSync(path.join(kernel.home, 'kvman.db'));
  try {
    const earlier = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    database.prepare("UPDATE store_documents SET data = json_set(data, '$.createdAt', ?) WHERE extension = '@kvman/kvcoder' AND collection = 'messages' AND json_extract(data, '$.kind') = 'assistant'").run(earlier);
  } finally {
    database.close();
  }
}

async function send(kernel: TestKernel, sessionId: string): Promise<void> {
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
}

describe('old tool results cleared (ADR 0094, 1)', { timeout: 60_000 }, () => {
  it('QA62-H1 and QA62-E2 after an hour the oldest results are sent cleared, the newest kept, and a read again returns the text', async () => {
    const { kernel, fake } = await kvcoder.start();
    bigFiles(7)(kernel.homeFolder);
    const sessionId = await newSession(kernel);
    fake.reply(reads(7), says('read them'));
    await send(kernel, sessionId);
    ageReplies(kernel);
    fake.reply(runs(fsCall('read', { path: 'big-0.txt' })), says('done'));
    await send(kernel, sessionId);
    const sent = toolTexts(fake, 2);
    expect(sent[0]).toBe(stub('big-0.txt'));
    expect(sent.slice(1, 7).every((text) => text.startsWith('{"path":"big-'))).toBe(true);
    expect(toolResults(fake).at(-1)).toMatch(/^\{"path":"big-0.txt","fromLine":1,/);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    const stored = messages.find((message) => message.kind === 'toolResult');
    expect(JSON.stringify(stored?.content)).toContain('xxxxxxxxxx');
  });

  it('QA62-E1 a recent chat with little to clear sends every result whole', async () => {
    const { kernel, fake } = await kvcoder.start();
    bigFiles(7)(kernel.homeFolder);
    const sessionId = await newSession(kernel);
    fake.reply(reads(7), says('read them'));
    await send(kernel, sessionId);
    fake.reply(says('done'));
    await send(kernel, sessionId);
    expect(toolTexts(fake, 2).some((text) => text.startsWith('[cleared'))).toBe(false);
  });

  it('QA62-H2 a half-full prompt with much to clear is cleared at once, and that step makes no summary', async () => {
    const { kernel, fake } = await kvcoder.start();
    await kernel.exec('kvai.model.add', { provider: 'fake', id: 'small', name: 'Small', input: ['text'], reasoning: true, contextWindow: 60_000, maxTokens: 8192 });
    bigFiles(10)(kernel.homeFolder);
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.session.configure', { sessionId, model: 'fake/small' });
    fake.reply(reads(10), says('read them'));
    await send(kernel, sessionId);
    expect(toolTexts(fake, 1).slice(0, 4)).toEqual([0, 1, 2, 3].map((index) => stub(`big-${String(index)}.txt`)));
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.some((message) => message.kind === 'summary')).toBe(false);
  });
});
