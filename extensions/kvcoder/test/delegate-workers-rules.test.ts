import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { shippedWorkers } from '../src/delegate/workers.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

const delegate = (name: string, task = 'Do it') => command('delegate', 'run', { worker: name, task });
const indexed = (prompt: string): string[] => prompt.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2, line.indexOf(':')));

describe("the rules of a worker's child and of the workers setting (08 §8.5, ADR 0021, 20 and 24)", { timeout: 30_000 }, () => {
  it('QA31-E4 a child never has delegate, even when its worker names it', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('deep', { connectors: ['delegate', 'fs'] })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('deep')), runs(delegate('deep')), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(indexed(systemPrompt(fake, 1))).toEqual(['fs', 'ask']);
    expect(toolResults(fake, 2)).toEqual(["error VALIDATION_FAILED: delegate isn't available in this subagent."]);
  });

  it("QA31-E5 a connector the chat doesn't have is ignored", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('odd', { connectors: ['nope', 'fs'] })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('odd')), runs(fsCall('list')), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(indexed(systemPrompt(fake, 1))).toEqual(['fs', 'ask']);
    expect(toolResults(fake, 2)[0]).toMatch(/^\{\n {2}"path": /);
    expect(toolResults(fake, 3)).toEqual(['child done']);
  });

  it.each([
    ['two workers with one name', [worker('a'), worker('a')]],
    ['a name that is not lowercase kebab case', [worker('Big_Name')]],
    ['an empty description', [worker('a', { description: '' })]],
    ['an unknown key', [{ ...worker('a'), extra: true }]],
    ['a kind that is not subagent', [{ ...worker('a'), kind: 'robot' }]],
    ['a thinking that is not a level', [worker('a', { thinking: 'huge' })]],
    ['instructions over 16 KB', [worker('a', { instructions: 'x'.repeat(16 * 1024 + 1) })]],
  ])('QA31-E7 the setting is strict: %s', async (_case, value) => {
    const { kernel } = await kvcoder.start();
    await expect(kernel.exec('kernel.settings.set', { key: 'kvcoder.delegate.workers', value, scope: 'global' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(kernel.exec('kernel.settings.set', { key: 'kvcoder.delegate.workers', value: [worker('a', { instructions: 'x'.repeat(16 * 1024) })], scope: 'global' })).resolves.toEqual({});
  });

  it("QA31-E8 a workspace's list replaces the global one", async () => {
    const { kernel, fake, root } = await kvcoder.start({ settings: workers(worker('everywhere')) });
    const other = await kernel.exec('kernel.workspace.open', { path: mkdtempSync(path.join(root, 'other-')) });
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.delegate.workers', value: [worker('here')], scope: 'workspace' }, { workspaceId: other.id });
    const there = await newSession(kernel, other.id);
    fake.reply(runs(delegate('everywhere')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId: there, text: 'go' }, { workspaceId: other.id });
    await kernel.clock.advance(0);
    expect(systemPrompt(fake, 0)).toContain('Workers: here (The here worker).');
    expect(toolResults(fake)).toEqual(['error kvcoder/WORKER_NOT_FOUND: There is no worker everywhere. The workers are: here.']);
  });

  it('QA31-E9 a child keeps the instructions it started with', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('careful', { instructions: 'Be careful.' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('careful')), runs(command('ask', 'text', { prompt: '?' })), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const childId = String((await turnState(kernel, sessionId)).turn?.pending[0]?.childSessionId);
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.delegate.workers', value: [worker('careful', { instructions: 'Be bold.' })], scope: 'global' });
    const questionId = String((await turnState(kernel, childId)).turn?.pending[0]?.questionId);
    await kernel.exec('kvcoder.question.answer', { questionId, answer: { text: 'yes' } });
    await kernel.clock.advance(0);
    expect(systemPrompt(fake, 1)).toContain('## Worker: careful\nBe careful.');
    expect(systemPrompt(fake, 2)).toContain('## Worker: careful\nBe careful.');
    expect(systemPrompt(fake, 2)).not.toContain('Be bold.');
    expect(toolResults(fake, 3)).toEqual(['child done']);
  });

  it("QA31-E10 a worker's unknown model fails its child, and the call returns subagent ended failed", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('lost', { model: 'fake/none' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('lost')), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['subagent ended failed\n']);
    expect(shippedWorkers.every((entry) => entry.model === null)).toBe(true);
  });
});
