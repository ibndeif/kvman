import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says, shell, toolResults, withoutHelperId } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();
const inHome = (kernel: TestKernel, file: string) => path.join(kernel.homeFolder, file);
const risky = (content: string, file = 'a.txt') => fsCall('write', { path: file, content, risky: true });
const auto = shell('echo auto > b.txt');

async function approvals(kernel: TestKernel, sessionId: string): Promise<string[]> {
  return ((await turnState(kernel, sessionId)).turn?.pending ?? []).map((item) => String(item.questionId));
}
const answer = (kernel: TestKernel, questionId: string, confirmed: boolean) => kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed } });

// The commands here are bash, the Linux and macOS branch.
describe("effects run in the model's order (KVC-07, ADR 0046)", { timeout: 30_000 }, () => {
  it('M2.4-E127 two approved writes to one file, answered in reverse, leave the second call’s content', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(risky('first'), risky('second')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [one, two] = await approvals(kernel, sessionId);
    await answer(kernel, String(two), true);
    await answer(kernel, String(one), true);
    await kernel.clock.advance(0);
    expect(readFileSync(inHome(kernel, 'a.txt'), 'utf8')).toBe('second');
    expect(fake.requests()).toHaveLength(2);
  });

  it.each([true, false])('M2.4-E127 an automatic effect behind a pending approval waits for it, then runs (approved %s)', async (confirmed) => {
    if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(risky('first'), auto, fsCall('read', { path: 'README.md' })), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(existsSync(inHome(kernel, 'b.txt'))).toBe(false);
    expect((await turnState(kernel, sessionId)).session.status).toBe('waiting');
    expect(fake.requests()).toHaveLength(1);
    const [one] = await approvals(kernel, sessionId);
    await answer(kernel, String(one), confirmed);
    await kernel.clock.advance(0);
    expect(existsSync(inHome(kernel, 'a.txt'))).toBe(confirmed);
    expect(readFileSync(inHome(kernel, 'b.txt'), 'utf8')).toBe('auto\n');
    const results = toolResults(fake);
    expect(results).toHaveLength(3);
    expect(results[0]).toContain(confirmed ? 'a.txt' : 'denied');
    expect(results[1]).toBe('[exit code 0]');
    expect(fake.requests()).toHaveLength(2);
  });

  it('M2.4-E127 a helper run behind a pending approval is not started, and says to call again', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(risky('first'), command('delegate', 'run', { worker: 'general', title: 'Helper', task: 'Go' })), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const pending = (await turnState(kernel, sessionId)).turn?.pending ?? [];
    expect(pending.map((item) => item.kind)).toEqual(['approval']);
    await answer(kernel, String(pending[0]?.questionId), true);
    await kernel.clock.advance(0);
    expect(toolResults(fake)[1]).toMatch(/^error VALIDATION_FAILED: Not started: an earlier call in this reply waits for a decision\. Make this call again/);
    expect(fake.requests()).toHaveLength(2);
  });

  it('M2.4-E127 a message that dismisses the approval settles the held effect without running it', async () => {
    if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(risky('first'), auto), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'never mind' });
    await kernel.clock.advance(0);
    expect(existsSync(inHome(kernel, 'a.txt'))).toBe(false);
    expect(existsSync(inHome(kernel, 'b.txt'))).toBe(false);
    expect(toolResults(fake)[1]).toContain('not run');
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
  });

  it('M2.4-E127 two helpers in one reply still both start', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const helper = command('delegate', 'run', { worker: 'general', title: 'Helper', task: 'Go' });
    fake.reply(runs(helper, helper), says('one'), says('two'), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake).map(withoutHelperId).sort()).toEqual(['one', 'two']);
  });
});
