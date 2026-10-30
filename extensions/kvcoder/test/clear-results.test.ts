import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from '@kvman/sdk';
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

// Each call's arguments in the model request at `index`, in order.
const callArguments = (fake: Parameters<typeof requestMessages>[0], index: number): unknown[] =>
  requestMessages(fake, index).flatMap((message) => message.tool_calls ?? []).map((call) => {
    const parsed = z.object({ function: z.object({ arguments: z.string() }) }).parse(call);
    return JSON.parse(parsed.function.arguments);
  });

describe('old tool results cleared (ADR 0094, 1)', { timeout: 60_000 }, () => {
  // QA67-E16: a clear keeps the newest 24,000 tokens of results (ADR 0102, 6).
  it('QA62-H1 QA62-E2 QA67-E16 after an hour the oldest results are sent cleared, the newest kept, and a read again returns the text', async () => {
    const { kernel, fake } = await kvcoder.start();
    bigFiles(7)(kernel.homeFolder);
    const sessionId = await newSession(kernel);
    fake.reply(reads(7), says('read them'));
    await send(kernel, sessionId);
    ageReplies(kernel);
    fake.reply(runs(fsCall('read', { path: 'big-0.txt' })), says('done'));
    await send(kernel, sessionId);
    const sent = toolTexts(fake, 2);
    // Each read holds about 8,000 tokens, so the newest three fill the 24,000 kept and the four before them are cleared.
    expect(sent.slice(0, 4)).toEqual([0, 1, 2, 3].map((index) => stub(`big-${String(index)}.txt`)));
    expect(sent.slice(4, 7).every((text) => text.startsWith('big-'))).toBe(true);
    expect(toolResults(fake).at(-1)).toMatch(/^big-0.txt · lines 1–/);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    const stored = messages.find((message) => message.kind === 'toolResult');
    expect(JSON.stringify(stored?.content)).toContain('xxxxxxxxxx');
  });

  it("QA65-H9 and QA65-E12 a cleared result's call is sent with its long text cleared, a newer call whole, and the stored call unchanged", async () => {
    const { kernel, fake } = await kvcoder.start();
    bigFiles(7)(kernel.homeFolder);
    const sessionId = await newSession(kernel);
    const long = 'w'.repeat(800);
    fake.reply(runs(fsCall('write', { path: 'old.txt', content: long })), reads(7), says('read them'));
    await send(kernel, sessionId);
    ageReplies(kernel);
    fake.reply(runs(fsCall('write', { path: 'new.txt', content: long })), says('done'));
    await send(kernel, sessionId);
    expect(callArguments(fake, 3)[0]).toEqual({ connector: 'fs', command: 'write', payload: { path: 'old.txt', content: '[cleared to save memory: 800 characters]', risky: false } });
    expect(callArguments(fake, 4).at(-1)).toEqual({ connector: 'fs', command: 'write', payload: { path: 'new.txt', content: long, risky: false } });
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(JSON.stringify(messages.find((message) => message.kind === 'assistant')?.content)).toContain(long);
  });

  // Six reads keep the prompt well under half the 128K window, whatever the base prompt's length (ADR 0103 grew it).
  it('QA62-E1 a recent chat with little to clear sends every result whole', async () => {
    const { kernel, fake } = await kvcoder.start();
    bigFiles(6)(kernel.homeFolder);
    const sessionId = await newSession(kernel);
    fake.reply(reads(6), says('read them'));
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

  // A model with a window as large as the owner's (272K), so only the fixed 60,000 tokens can start a clear (ADR 0108, 5).
  async function wideChat() {
    const { kernel, fake } = await kvcoder.start();
    await kernel.exec('kvai.model.add', { provider: 'fake', id: 'wide', name: 'Wide', input: ['text'], reasoning: true, contextWindow: 272_000, maxTokens: 8192 });
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.session.configure', { sessionId, model: 'fake/wide' });
    return { kernel, fake, sessionId };
  }

  it('QA67-H12 a prompt past 80,000 tokens with much to clear is cleared, keeping the newest 24,000 tokens of results', async () => {
    const { kernel, fake, sessionId } = await wideChat();
    bigFiles(12)(kernel.homeFolder);
    fake.reply(reads(12), says('read them'));
    await send(kernel, sessionId);
    const sent = toolTexts(fake, 1);
    expect(sent.slice(0, 9)).toEqual(Array.from({ length: 9 }, (_read, index) => stub(`big-${String(index)}.txt`)));
    expect(sent.slice(9).every((text) => text.startsWith('big-'))).toBe(true);
  });

  // Superseded in part by ADR 0108, 5: the trim comes at 60,000 tokens, so six reads stay under it.
  it('QA67-E14 a prompt under 60,000 tokens is not cleared in a turn, whatever the window', async () => {
    const { kernel, fake, sessionId } = await wideChat();
    bigFiles(6)(kernel.homeFolder);
    fake.reply(reads(6), says('read them'));
    await send(kernel, sessionId);
    expect(toolTexts(fake, 1).some((text) => text.startsWith('[cleared'))).toBe(false);
  });

  it('QA67-E15 a large prompt with little to clear is not cleared', async () => {
    const { kernel, fake, sessionId } = await wideChat();
    bigFiles(4)(kernel.homeFolder);
    fake.reply(reads(4), says('read them'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'y'.repeat(260_000) });
    await kernel.clock.advance(0);
    expect(toolTexts(fake, 1).some((text) => text.startsWith('[cleared'))).toBe(false);
  });
});
