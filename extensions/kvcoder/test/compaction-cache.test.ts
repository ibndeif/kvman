import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { padded, unpadded } from './support/long-messages.ts';
import { requestMessages, requestTools, runs, says, shell, systemPrompt, textOf, unstamped } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const instruction =
  'Summarize the conversation above for the agent that continues it: the goal, the decisions, the files and commands that matter, what is done, and what is left. Keep names, paths, and numbers exact. Reply with the summary only, and call no tool.';

const compactAt = (kernel: TestKernel, value: number) => kernel.exec('kernel.settings.set', { key: 'kvcoder.compactAt', value, scope: 'global' });

async function turns(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, indexes: readonly number[]): Promise<void> {
  for (const index of indexes) {
    fake.reply(says(`answer ${index}`));
    await kernel.exec('kvcoder.message.send', { sessionId, text: padded(`message ${index}`) });
    await kernel.clock.advance(0);
  }
}

// Seven turns of a message and an answer, whose first five messages a summary takes; then every step is past `compactAt`.
async function history(kernel: TestKernel, fake: FakeOpenAI, sessionId: string): Promise<void> {
  await turns(kernel, fake, sessionId, [1, 2, 3, 4, 5, 6, 7]);
  await compactAt(kernel, 0.0001);
}

// A request's messages after the system prompt, as `role:text`, without the filler; `plain` leaves the stamps out too.
const sent = (fake: FakeOpenAI, index: number, plain = false): string[] =>
  requestMessages(fake, index)
    .filter((message) => message.role !== 'system' && message.role !== 'developer')
    .map((message) => `${message.role}:${unpadded(plain ? unstamped(textOf(message)) : textOf(message))}`);

async function kinds(kernel: TestKernel, sessionId: string) {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return messages;
}

describe("a summary's request is a step's own (08 §8.1, ADR 0032, 2, 7, and 8)", { timeout: 30_000 }, () => {
  it("QA44-H4 a summary is asked for with the step's prompt, tool, and older messages, then the instruction", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    fake.reply(says('SUMMARY'), says('answer 8'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 8' });
    await kernel.clock.advance(0);
    expect(systemPrompt(fake, -2)).toBe(systemPrompt(fake, -1));
    expect(systemPrompt(fake, -2)).toMatch(/^You are kvman Coder/);
    expect(requestTools(fake, -2)).toEqual(requestTools(fake, -1));
    expect(requestTools(fake, -2)).toHaveLength(1);
    const summary = sent(fake, -2);
    expect(sent(fake, -2, true)).toEqual(['user:message 1', 'assistant:answer 1', 'user:message 2', 'assistant:answer 2', 'user:message 3', `user:${instruction}`]);
    expect(summary[0]).toMatch(/^user:\[[A-Z][a-z]+day \d{4}-\d{2}-\d{2} \d{2}:\d{2} [+-]\d{2}:\d{2}\]\nmessage 1$/);
    expect(summary.slice(0, 5)).toEqual(sent(fake, -3).slice(0, 5));
    expect((await kinds(kernel, sessionId)).find((message) => message.kind === 'summary')?.content).toEqual({ text: 'SUMMARY', coversThroughSeq: 4 });
  });

  it('QA44-E4 a summary answered with a call and no text adds a notice, stores nothing, and the step goes on', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    fake.reply(runs(shell('echo no')), says('answer 8'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 8' });
    await kernel.clock.advance(0);
    const messages = await kinds(kernel, sessionId);
    expect(messages.filter((message) => message.kind === 'notice').map((message) => message.content)).toEqual([{ code: 'SUMMARY_FAILED', params: { code: 'kvcoder/SUMMARY_EMPTY' } }]);
    expect(messages.filter((message) => message.kind === 'summary' || message.kind === 'toolResult')).toEqual([]);
    expect(messages.at(-1)).toMatchObject({ kind: 'assistant' });
    expect(sent(fake, -1).at(-1)).toMatch(/\nmessage 8$/);
    expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('done');
  });

  it('QA44-E5 an earlier summary is sent first, with its lead and no stamp', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    fake.reply(says('SUMMARY'), says('answer 8'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 8' });
    await kernel.clock.advance(0);
    await compactAt(kernel, 0.8);
    await turns(kernel, fake, sessionId, [9, 10, 11, 12]);
    await compactAt(kernel, 0.0001);
    fake.reply(says('SUMMARY 2'), says('answer 13'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 13' });
    await kernel.clock.advance(0);
    const second = sent(fake, -2);
    expect(second[0]).toBe('user:A summary of the earlier conversation:\nSUMMARY');
    expect(sent(fake, -2, true).slice(1, 4)).toEqual(['assistant:answer 3', 'user:message 4', 'assistant:answer 4']);
    expect(second.at(-1)).toBe(`user:${instruction}`);
    expect((await kinds(kernel, sessionId)).filter((message) => message.kind === 'summary').at(-1)?.content).toMatchObject({ text: 'SUMMARY 2' });
  });
});
