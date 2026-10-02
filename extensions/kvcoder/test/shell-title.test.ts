import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const wireToolSchema = z.object({ function: z.object({ name: z.string(), parameters: z.object({ properties: z.record(z.string(), z.looseObject({ description: z.string().optional() })), required: z.array(z.string()) }) }) });
const requestSchema = z.object({ tools: z.array(wireToolSchema) });

const labelled = { id: 'c1', name: 'bash', arguments: { title: 'Make a file', description: 'Creates made.txt so the person can see it.', command: 'echo hi', risky: false } };

describe("the shell tool's title and description (08 §8.2, ADR 0009, 143)", { timeout: 30_000 }, () => {
  it('QA3-H6, QA4-H8, and QA11-H2 the tool lists title, description, command, and risky in that order, with risky before mode, and only command required', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [tool] = requestSchema.parse(fake.requests()[0]?.body).tools;
    expect(tool?.function.name).toBe('bash');
    expect(Object.keys(tool?.function.parameters.properties ?? {})).toEqual(['title', 'description', 'command', 'risky', 'mode', 'timeoutMs']);
    expect(tool?.function.parameters.required).toEqual(['command']);
    for (const name of ['title', 'description']) expect(tool?.function.parameters.properties[name]?.description, name).toMatch(/^Optional\./);
    expect(tool?.function.parameters.properties['risky']?.description).toContain('Left out, it counts as true.');
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

  it('QA7-H1 and QA7-E5 a call without a title runs with its description as the title, and the stored call keeps what the model sent', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: { id: 'c1', name: 'bash', arguments: { description: 'Creates derived.txt in the workspace.', command: 'touch derived.txt', risky: false } } }] }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(existsSync(path.join(kernel.homeFolder, 'derived.txt'))).toBe(true);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 20 });
    expect(messages.find((message) => message.kind === 'toolResult')?.content['details']).toMatchObject({ title: 'Creates derived.txt in the workspace.', description: 'Creates derived.txt in the workspace.', command: 'touch derived.txt' });
    const call = JSON.stringify(messages.find((message) => message.kind === 'assistant')?.content['content']);
    expect(call).toContain('"command":"touch derived.txt"');
    expect(call).not.toContain('"title"');
  });

  it('QA7-H5 an approval shows the derived title', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.shell.approval': 'ask' } });
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: { id: 'c1', name: 'bash', arguments: { description: 'Lists the files here.', command: 'ls', risky: false } } }] }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const { turn } = await turnState(kernel, sessionId);
    expect(turn?.pending[0]?.question).toMatchObject({ title: 'Lists the files here.', command: 'ls' });
  });

  it('QA11-H1 a call with only a command runs, and its result holds no title or description', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: { id: 'c1', name: 'bash', arguments: { command: 'touch bare.txt', risky: false } } }] }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(existsSync(path.join(kernel.homeFolder, 'bare.txt'))).toBe(true);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 20 });
    const details = messages.find((message) => message.kind === 'toolResult')?.content['details'];
    expect(details).toMatchObject({ command: 'touch bare.txt' });
    expect(details).not.toHaveProperty('title');
    expect(details).not.toHaveProperty('description');
  });

  it('QA11-E1 a call without a command fails naming it, asks for the call again, and nothing runs', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: { id: 'c1', name: 'bash', arguments: { title: 'No command', description: 'Has no command.', risky: false } } }] }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual([expect.stringMatching(/^error VALIDATION_FAILED: The call's arguments are invalid: command: .*\(it must be the command to run\)\. Call bash again with the arguments fixed\.\n\[exit code 1\]$/)]);
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
