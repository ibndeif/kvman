import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const wireToolSchema = z.object({ function: z.object({ name: z.string(), parameters: z.object({ properties: z.record(z.string(), z.unknown()), required: z.array(z.string()) }) }) });
const requestSchema = z.object({ tools: z.array(wireToolSchema) });

const labelled = { id: 'c1', name: 'bash', arguments: { title: 'Make a file', description: 'Creates made.txt so the person can see it.', command: 'echo hi', risky: false } };

describe("the shell tool's title and description (08 §8.2, ADR 0009, 143)", { timeout: 30_000 }, () => {
  it('QA3-H6 and QA4-H8 the tool lists title, description, command, and risky in that order, with risky before mode, all four required', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [tool] = requestSchema.parse(fake.requests()[0]?.body).tools;
    expect(tool?.function.name).toBe('bash');
    expect(Object.keys(tool?.function.parameters.properties ?? {})).toEqual(['title', 'description', 'command', 'risky', 'mode', 'timeoutMs']);
    expect(tool?.function.parameters.required).toEqual(['title', 'description', 'command', 'risky']);
  });

  it('QA3-H6 an approval asks with the title, and the result keeps the title and description', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.shell.approval': 'ask' } });
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: labelled }] }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const { turn } = await turnState(kernel, sessionId);
    expect(turn?.pending[0]?.question).toEqual({ title: 'Make a file', command: 'echo hi', description: 'Creates made.txt so the person can see it.', mode: 'sync', timeoutMs: 120_000 });
    await kernel.exec('kvcoder.question.answer', { questionId: String(turn?.pending[0]?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.find((message) => message.kind === 'toolResult')?.content['details']).toMatchObject({ title: 'Make a file', description: 'Creates made.txt so the person can see it.', command: 'echo hi', exitCode: 0 });
  });

  it('QA3-H6 a call that needs no approval keeps its title and description in the result too', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: labelled }] }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.find((message) => message.kind === 'toolResult')?.content['details']).toMatchObject({ title: 'Make a file', description: 'Creates made.txt so the person can see it.' });
  });

  it('QA3-E7 a call without a title is an invalid call, and nothing runs', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: { id: 'c1', name: 'bash', arguments: { description: 'No title.', command: 'touch never.txt' } } }] }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual([expect.stringMatching(/^error VALIDATION_FAILED: The call's arguments are invalid: title: .*\n\[exit code 1\]$/) as unknown]);
  });

  it('QA4-H8 a call without risky is an invalid call, and nothing runs', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: { id: 'c1', name: 'bash', arguments: { title: 'No risk', description: 'No risky field.', command: 'touch never.txt' } } }] }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual([expect.stringMatching(/^error VALIDATION_FAILED: The call's arguments are invalid: risky: .*\n\[exit code 1\]$/) as unknown]);
  });

  it('QA3-H19 an async call asks with mode async, and allowing it starts a background job', async () => {
    if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.shell.approval': 'ask' } });
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: { ...labelled, arguments: { ...labelled.arguments, command: 'sleep 30', mode: 'async' } } }] }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const { turn } = await turnState(kernel, sessionId);
    expect(turn?.pending[0]?.question).toMatchObject({ command: 'sleep 30', mode: 'async' });
    await kernel.exec('kvcoder.question.answer', { questionId: String(turn?.pending[0]?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    const [job] = await kernel.exec('kvcoder.job.list', { sessionId });
    expect(job).toMatchObject({ kind: 'process', title: 'Make a file', status: 'running' });
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.find((message) => message.kind === 'toolResult')?.content['details']).toMatchObject({ mode: 'async', jobId: job?.id, exitCode: 0 });
  });
});
