import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { requestMessages, says } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const idless = { toolCall: { id: '', name: 'bash', arguments: { title: 'Make it', description: 'Makes idless.txt.', command: 'touch idless.txt', risky: false } } };

describe("a call the provider sent in pieces is repaired or dropped (08 §8.2, ADR 0009, 192)", { timeout: 30_000 }, () => {
  it('QA8-H11 a call without an id is given one that the call, its result, and the next request share', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [idless] }, says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(existsSync(path.join(kernel.homeFolder, 'idless.txt'))).toBe(true);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 20 });
    const stored = JSON.stringify(messages.find((message) => message.kind === 'assistant')?.content['content']);
    const id = /"id":"(call_[0-9a-f-]{36})"/.exec(stored)?.[1] ?? '';
    expect(id).not.toBe('');
    expect(messages.find((message) => message.kind === 'toolResult')?.content['toolCallId']).toBe(id);
    expect(JSON.stringify(requestMessages(fake, 1)).split(id).length - 1).toBe(2);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 2 });
  });

  it('QA8-E15 a call without a name is dropped, the model is told its reply was lost, the turn goes on, and the history stays valid', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: { id: '', name: '', arguments: {} } }], usage: { input: 100, output: 65 } }, says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 20 });
    expect(JSON.stringify(messages.find((message) => message.kind === 'assistant')?.content['content'])).not.toContain('toolCall');
    expect(messages.find((message) => message.source?.kind === 'extension')).toMatchObject({ kind: 'user' });
    expect(messages.some((message) => message.kind === 'toolResult')).toBe(false);
    const next = JSON.stringify(requestMessages(fake, 1));
    expect(next).not.toContain('tool_calls');
    expect(next).toContain('Your last reply was lost on the way');
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 2 });
  });
});
