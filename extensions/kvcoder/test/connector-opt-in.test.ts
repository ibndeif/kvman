import { describe, expect, it } from 'vitest';
import { z, type Json } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { todo, useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestTools, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { optInFixture } from './support/registry-fixtures.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const owner = '@test/todo';
const notes = { name: 'notes', description: 'Notes.', optIn: true as const, commands: [{ name: 'add', command: 'todo.item.add' }] };
const always = ['shell', 'fs', 'artifact', 'background', 'ask', 'delegate', 'todo'];
const runToolSchema = z.object({ function: z.object({ parameters: z.object({ properties: z.object({ connector: z.object({ enum: z.array(z.string()) }) }) }) }) });
const runEnum = (tools: unknown[]): string[] => runToolSchema.parse(tools[0]).function.parameters.properties.connector.enum;

const registerNotes = (kernel: TestKernel) => kernel.exec('kvcoder.connector.register', notes, { as: owner });
const enable = (kernel: TestKernel, sessionId: string, names: string[], as: string | null = owner) => kernel.exec('kvcoder.connector.enable', { sessionId, names }, as === null ? {} : { as });
const failed = (code: string, params?: Record<string, Json>) => ({ problem: { code, ...(params === undefined ? {} : { params }) } });

// The connector names of a session's prompt index, in order.
async function indexed(kernel: TestKernel, sessionId: string): Promise<(string | undefined)[]> {
  const { prompt } = await kernel.exec('kvcoder.prompt.get', { sessionId });
  return (prompt.split('## Connectors\n')[1] ?? '').split('\n').filter((line) => line.startsWith('- ')).map((line) => /^- ([\w-]+): /.exec(line)?.[1]);
}

async function send(kernel: TestKernel, sessionId: string): Promise<void> {
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
}

describe('connectors that are off until their owner enables them for a chat (08 §8.4, ADR 0027, 10)', { timeout: 30_000 }, () => {
  it('QA39-H13 an optIn connector is in no prompt and no run enum until it is enabled, and then it runs', async () => {
    const { kernel, fake } = await kvcoder.start();
    await registerNotes(kernel);
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => [connector.name, connector.optIn])).toEqual([['todo', false], ['notes', true]]);
    const sessionId = await newSession(kernel);
    fake.reply(says('before'));
    await send(kernel, sessionId);
    expect(await indexed(kernel, sessionId)).toEqual(always);
    expect(runEnum(requestTools(fake, 0))).toEqual(always);

    expect(await enable(kernel, sessionId, ['notes'])).toEqual({});
    expect(await indexed(kernel, sessionId)).toEqual([...always, 'notes']);
    fake.reply(runs(command('notes', 'add', { text: 'milk' })), says('done'));
    await send(kernel, sessionId);
    expect(runEnum(requestTools(fake, 1))).toEqual([...always, 'notes']);
    expect(await kernel.exec('todo.item.list', {})).toEqual([{ text: 'milk' }]);
  });

  it("QA39-E10 only the caller's own optIn connectors can be enabled", async () => {
    const { kernel } = await kvcoder.start();
    await registerNotes(kernel);
    await kernel.exec('kvcoder.connector.register', { name: 'theirs', description: 'Theirs.', optIn: true, binary: { check: 'true' } }, { as: '@kvman/kvai' });
    const sessionId = await newSession(kernel);
    for (const name of ['todo', 'theirs', 'nope', 'shell']) {
      await expect(enable(kernel, sessionId, ['notes', name]), name).rejects.toMatchObject(failed('VALIDATION_FAILED', { name }));
      expect(await indexed(kernel, sessionId)).toEqual(always);
    }
    await expect(enable(kernel, sessionId, ['notes'], null)).rejects.toMatchObject(failed('VALIDATION_FAILED'));
    expect(await indexed(kernel, sessionId)).toEqual(always);
  });

  it("QA39-E11 the session must exist and be a top-level one", async () => {
    const { kernel, fake } = await kvcoder.start();
    await registerNotes(kernel);
    await expect(enable(kernel, 'nope', ['notes'])).rejects.toMatchObject(failed('kvcoder/SESSION_NOT_FOUND'));
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'general', task: 'Wait' })), runs(command('ask', 'text', { prompt: '?' })));
    await send(kernel, sessionId);
    const childId = String((await turnState(kernel, sessionId)).turn?.pending[0]?.childSessionId);
    await expect(enable(kernel, childId, ['notes'])).rejects.toMatchObject(failed('VALIDATION_FAILED', { sessionId: childId }));
  });

  it('QA39-E12 a call to an optIn connector the chat did not enable finds no connector, and nothing runs', async () => {
    const { kernel, fake } = await kvcoder.start();
    await registerNotes(kernel);
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('notes', 'add', { text: 'milk' })), says('done'));
    await send(kernel, sessionId);
    expect(toolResults(fake)).toEqual([`error VALIDATION_FAILED: There is no connector notes. The connectors are: ${always.join(', ')}.`]);
    expect(await kernel.exec('todo.item.list', {})).toEqual([]);
  });

  it('QA39-E13 optIn takes only true', async () => {
    const { kernel } = await kvcoder.start();
    await expect(kernel.exec('kvcoder.connector.register', { ...notes, optIn: false } as never, { as: owner })).rejects.toMatchObject(failed('VALIDATION_FAILED'));
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => connector.name)).toEqual(['todo']);
  });

  it('QA39-E14 enabling is kept across a restart, and twice is once', async () => {
    const { kernel } = await kvcoder.start({ extensions: [todo, optInFixture] });
    await kernel.clock.advance(0);
    const sessionId = await newSession(kernel);
    await enable(kernel, sessionId, ['optin'], '@test/optin');
    await enable(kernel, sessionId, ['optin'], '@test/optin');
    await kernel.restart();
    await kernel.clock.advance(0);
    expect((await indexed(kernel, sessionId)).filter((name) => name === 'optin')).toEqual(['optin']);
  });

  it('QA39-E15 another chat is untouched', async () => {
    const { kernel } = await kvcoder.start();
    await registerNotes(kernel);
    const first = await newSession(kernel);
    const second = await newSession(kernel);
    await enable(kernel, first, ['notes']);
    expect(await indexed(kernel, first)).toEqual([...always, 'notes']);
    expect(await indexed(kernel, second)).toEqual(always);
  });

  it('QA39-E16 a fork starts with none enabled', async () => {
    const { kernel } = await kvcoder.start();
    await registerNotes(kernel);
    const sessionId = await newSession(kernel);
    await enable(kernel, sessionId, ['notes']);
    const fork = await kernel.exec('kvcoder.session.fork', { sessionId });
    expect(await indexed(kernel, fork.id)).toEqual(always);
    expect(await indexed(kernel, sessionId)).toEqual([...always, 'notes']);
  });

  it('QA39-E18 the setting that turns connectors off still wins over an enabled optIn connector', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.connectors.disabled': ['notes'] } });
    await registerNotes(kernel);
    const sessionId = await newSession(kernel);
    await enable(kernel, sessionId, ['notes']);
    fake.reply(says('done'));
    await send(kernel, sessionId);
    expect(await indexed(kernel, sessionId)).toEqual(always);
    expect(systemPrompt(fake, 0)).not.toContain('- notes: ');
  });
});
