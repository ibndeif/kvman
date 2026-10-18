import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { rawCall, requestMessages, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

const sentCallSchema = z.object({ function: z.object({ name: z.string(), arguments: z.string() }) });

describe('a call with a description (08 §8.2, ADR 0089, 1)', { timeout: 30_000 }, () => {
  it('QA57-E1 and QA57-H7 a call that still sends a description fails and runs nothing, and the model is sent it without the description', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(rawCall('run', { description: 'Adding milk.', connector: 'todo', command: 'add', payload: { text: 'milk' } }), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)[0]).toBe('error VALIDATION_FAILED: The call\'s arguments are invalid: arguments: Unrecognized key: "description". Call run again with the arguments fixed.');
    expect(await kernel.exec('todo.item.list', {})).toEqual([]);
    const reply = requestMessages(fake).find((message) => message.role === 'assistant');
    const [sent] = z.array(sentCallSchema).parse(reply?.tool_calls);
    expect(JSON.parse(sent?.function.arguments ?? '{}')).toEqual({ connector: 'todo', command: 'add', payload: { text: 'milk' } });
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 });
    const stored = z.array(z.object({ arguments: z.record(z.string(), z.unknown()) })).parse(messages.find((message) => message.kind === 'assistant')?.content['content']);
    expect(stored[0]?.arguments['description']).toBe('Adding milk.');
  });
});
