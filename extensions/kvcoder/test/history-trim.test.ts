import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fsCall, requestMessages, runs, says, textOf } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

// One trim of the history at 60,000 tokens, or after an hour: finished turns collapsed (plan 08 §8.1, ADR 0108, 5).

const kvcoder = useKvcoder();
const bigFiles = (folder: string, count: number): void => {
  for (let index = 0; index < count; index += 1) writeFileSync(path.join(folder, `big-${String(index)}.txt`), `${'x'.repeat(99)}\n`.repeat(400));
};
// Each read holds about 8,000 tokens.
const reads = (from: number, count: number) => runs(...Array.from({ length: count }, (_read, index) => fsCall('read', { path: `big-${String(from + index)}.txt` })));
// Two replies that think aloud at length beside a small call: about 30,000 tokens that only collapsing takes out (a
// reply's text holds at most 64 KB).
let talks = 0;
const talk = (): FakeReply => {
  talks += 1;
  return { chunks: [{ text: `${'t'.repeat(60_000)} ${String(talks)}` }, { toolCall: { id: `talk-${String(talks)}`, name: 'run', arguments: { connector: 'fs', command: 'list', payload: {} } } }] };
};
const talks30k = (): FakeReply[] => [talk(), talk()];

async function chat(window = 272_000) {
  const { kernel, fake } = await kvcoder.start();
  await kernel.exec('kvai.model.add', { provider: 'fake', id: 'wide', name: 'Wide', input: ['text'], reasoning: true, contextWindow: window, maxTokens: 8192 });
  const sessionId = await newSession(kernel);
  await kernel.exec('kvcoder.session.configure', { sessionId, model: 'fake/wide' });
  bigFiles(kernel.homeFolder, 12);
  const turn = async (text: string, ...replies: FakeReply[]): Promise<void> => {
    fake.reply(...replies);
    await kernel.exec('kvcoder.message.send', { sessionId, text });
    await kernel.clock.advance(0);
  };
  return { kernel, fake, sessionId, turn };
}

const shape = (fake: Parameters<typeof requestMessages>[0], index: number): string[] => requestMessages(fake, index).filter((message) => message.role !== 'system' && message.role !== 'developer').map((message) => `${message.role}:${textOf(message).split('\n').at(-1) ?? ''}`);

function storedSent(kernel: TestKernel): { prefixKept: boolean }[] {
  const database = new DatabaseSync(path.join(kernel.home, 'kvman.db'));
  try {
    const rows = database.prepare("SELECT json_extract(data, '$.sent') AS sent FROM store_documents WHERE extension = '@kvman/kvcoder' AND collection = 'messages' AND json_extract(data, '$.kind') = 'assistant' ORDER BY json_extract(data, '$.seq')").all() as { sent: string | null }[];
    return rows.map((row) => JSON.parse(row.sent ?? 'null'));
  } finally {
    database.close();
  }
}

describe('the one trim of the history (ADR 0108, 5)', { timeout: 60_000 }, () => {
  it('QA71-H13 past 60,000 tokens the finished turns but the newest are sent as their message and answer, and no summary is made', async () => {
    const { kernel, fake, sessionId, turn } = await chat();
    await turn('first', ...talks30k(), says('one'));
    await turn('second', ...talks30k(), says('two'));
    await turn('third', says('three'));
    // At the third turn the first may collapse; the second, the newest ended one, stays whole.
    const third = shape(fake, -1);
    expect(third.slice(0, 3)).toEqual(['user:first', 'assistant:one', 'user:second']);
    expect(third.slice(3, 7).map((line) => line.split(':')[0])).toEqual(['assistant', 'tool', 'assistant', 'tool']);
    expect(third.slice(-2)).toEqual(['assistant:two', 'user:third']);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 200 });
    expect(messages.some((message) => message.kind === 'summary')).toBe(false);
    expect(messages.filter((message) => message.kind === 'toolResult')).toHaveLength(4);
  });

  it('QA71-H14 a collapsed turn that changed a file names it', async () => {
    const { fake, turn } = await chat();
    await turn('write it', ...talks30k(), runs(fsCall('write', { path: 'notes.txt', content: 'n' })), says('written'));
    await turn('second', ...talks30k(), says('two'));
    await turn('third', says('three'));
    expect(shape(fake, -1)[1]).toBe('assistant:[kvman: files changed in this turn: notes.txt]');
  });

  it('QA71-H15 at a turn\'s first step after an hour the finished turns collapse, whatever the size', async () => {
    const { kernel, fake, turn } = await chat();
    await turn('first', reads(0, 1), says('one'));
    await turn('second', says('two'));
    const database = new DatabaseSync(path.join(kernel.home, 'kvman.db'));
    database.prepare("UPDATE store_documents SET data = json_set(data, '$.createdAt', ?) WHERE extension = '@kvman/kvcoder' AND collection = 'messages' AND json_extract(data, '$.kind') = 'assistant'").run(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    database.close();
    await turn('third', says('three'));
    expect(shape(fake, 3)).toEqual(['user:first', 'assistant:one', 'user:second', 'assistant:two', 'user:third']);
  });

  it('QA71-H16 the steps after a trim each start with the messages of the step before', async () => {
    const { kernel, turn } = await chat();
    await turn('first', ...talks30k(), says('one'));
    await turn('second', ...talks30k(), says('two'));
    await turn('third', says('three'));
    await turn('fourth', runs(fsCall('list')), runs(fsCall('list')), runs(fsCall('list')), says('four'));
    // The third turn's one step trimmed; the fourth's four steps each kept the prefix.
    const sent = storedSent(kernel);
    expect(sent.slice(-5).map((record) => record.prefixKept)).toEqual([false, true, true, true, true]);
  });

  it('QA71-E14 with a window of 100,000 tokens the trim comes past 50,000, and with a wide one not yet', async () => {
    for (const [window, collapsed] of [[100_000, true], [272_000, false]] as const) {
      const { fake, turn } = await chat(window);
      await turn('first', talk(), talk(), talk(), says('one'));
      await turn('second', says('two'));
      await turn('third', says('three'));
      expect(shape(fake, -1)[1] === 'assistant:one', String(window)).toBe(collapsed);
    }
  });

  it('QA71-H21 each reply records the hashes of what it was sent, and none of its text', async () => {
    const { kernel, turn } = await chat();
    await turn('a secret plan', says('ok'));
    const [record] = storedSent(kernel);
    expect(Object.keys(record ?? {}).sort()).toEqual(['messageCount', 'messagesHash', 'prefixKept', 'promptHash']);
    expect(JSON.stringify(record)).not.toContain('secret');
    expect(record).toMatchObject({ messageCount: 1, prefixKept: false });
  });

  it('QA71-E15 the summary still saves a prompt the trim cannot make small', async () => {
    const { kernel, sessionId, turn } = await chat(100_000);
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.compactAt', value: 0.3, scope: 'global' });
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.compactKeep', value: 2, scope: 'global' });
    // The person's own long message stays whole in any trim, so only a summary makes this prompt small.
    await turn('y'.repeat(150_000), says('first'));
    await turn('two', says('summary text'), says('second'));
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 200 });
    expect(messages.some((message) => message.kind === 'summary')).toBe(true);
  });
});
