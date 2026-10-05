import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Json } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

const off = (...names: string[]): Record<string, Json> => ({ 'kvcoder.connectors.disabled': names });

// The connector names of a prompt's index, in order.
function indexed(prompt: string): (string | undefined)[] {
  const lines = (prompt.split('## Connectors\n')[1] ?? '').split('\n');
  return lines.filter((line) => line.startsWith('- ')).map((line) => /^- ([\w-]+): /.exec(line)?.[1]);
}

describe('connectors that are turned off (08 §8.4, ADR 0014, 7)', { timeout: 30_000 }, () => {
  it('QA21-H8 a connector that is off is in no prompt, and a call to it gets the answer for one that does not exist', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: off('fs', 'todo') });
    const sessionId = await newSession(kernel);
    fake.reply(runs(fsCall('list'), command('todo', 'list')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(indexed(systemPrompt(fake, 0))).toEqual(['shell', 'artifact', 'background', 'ask', 'delegate']);
    const expected = (name: string) => `error VALIDATION_FAILED: There is no connector ${name}. The connectors are: shell, artifact, background, ask, delegate.`;
    expect(toolResults(fake)).toEqual([expected('fs'), expected('todo')]);
  });

  it('QA21-H9 kvcoder.connector.list says which connectors are on', async () => {
    const programs = [{ name: 'gh', description: 'GitHub CLI.', binary: { check: 'true' } }];
    const { kernel } = await kvcoder.start({ settings: { 'kvcoder.connectors': programs, ...off('gh') } });
    await kernel.clock.advance(0);
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => [connector.name, connector.enabled])).toEqual([['todo', true], ['gh', false]]);
  });

  it("QA21-E7 a subagent gets no connector that is off, not even ask, and its worker can't give it one", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { ...off('ask', 'fs'), ...workers(worker('limited', { connectors: ['fs', 'todo'] })) } });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'limited', task: 'Review' })), runs(command('ask', 'text', { prompt: 'Name?' })), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(indexed(systemPrompt(fake, 1))).toEqual(['todo']);
    expect(toolResults(fake, 2)).toEqual(['error VALIDATION_FAILED: There is no connector ask. The connectors are: todo.']);
  });

  it('QA31-E6 delegate can be turned off, and a subagent entry names no connector', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: off('delegate') });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'general', task: 'Review' })), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(indexed(systemPrompt(fake, 0))).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'todo']);
    expect(toolResults(fake)).toEqual(['error VALIDATION_FAILED: There is no connector delegate. The connectors are: shell, fs, artifact, background, ask, todo.']);
    const old = await kvcoder.start({ settings: off('subagent') });
    old.fake.reply(says('done'));
    await old.kernel.exec('kvcoder.message.send', { sessionId: await newSession(old.kernel), text: 'go' });
    await old.kernel.clock.advance(0);
    expect(indexed(systemPrompt(old.fake, 0))).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'delegate', 'todo']);
  });

  it("QA21-E8 a name nothing has is ignored, and a workspace's own list replaces the one for all", async () => {
    const { kernel, fake, root } = await kvcoder.start({ settings: off('nope') });
    const other = await kernel.exec('kernel.workspace.open', { path: mkdtempSync(path.join(root, 'other-')) });
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.connectors.disabled', value: ['shell'], scope: 'workspace' }, { workspaceId: other.id });
    fake.reply(says('home'), says('other'));
    await kernel.exec('kvcoder.message.send', { sessionId: await newSession(kernel), text: 'go' });
    await kernel.clock.advance(0);
    await kernel.exec('kvcoder.message.send', { sessionId: await newSession(kernel, other.id), text: 'go' }, { workspaceId: other.id });
    await kernel.clock.advance(0);
    expect(indexed(systemPrompt(fake, 0))).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'delegate', 'todo']);
    expect(indexed(systemPrompt(fake, 1))).toEqual(['fs', 'artifact', 'background', 'ask', 'delegate', 'todo']);
  });

  it('QA21-E9 the list applies from the next step of a chat', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('first'), says('second'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.connectors.disabled', value: ['fs'], scope: 'global' });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    expect(indexed(systemPrompt(fake, 0))).toContain('fs');
    expect(indexed(systemPrompt(fake, 1))).not.toContain('fs');
    await expect(kernel.exec('kernel.settings.set', { key: 'kvcoder.connectors.disabled', value: ['Not A Name'], scope: 'global' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });
});
