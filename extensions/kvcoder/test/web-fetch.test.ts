import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';
import { delegated } from './support/helpers.ts';

const kvcoder = useKvcoder();

// The web connector in a chat (08 §8.5, ADR 0095). 127.0.0.1 is refused before any request, so no test reaches a network.
const fetchLocal = (path: string) => command('web', 'fetch', { url: `http://127.0.0.1${path}` });
const refusedLocal = /^error VALIDATION_FAILED: 127\.0\.0\.1 is a private or local address/;

async function answerFirst(kernel: TestKernel, sessionId: string): Promise<void> {
  const { turn } = await turnState(kernel, sessionId);
  await kernel.exec('kvcoder.question.answer', { questionId: String(turn?.pending[0]?.questionId), answer: { confirmed: true } });
  await kernel.clock.advance(0);
}

describe('web fetch in a chat (ADR 0095)', { timeout: 30_000 }, () => {
  it('QA63-H3 and QA63-E1 the first fetch from a host asks, the allowed host is remembered, and a local address is refused', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.approval': 'auto' } });
    const sessionId = await newSession(kernel);
    fake.reply(runs(fetchLocal('/a')), runs(fetchLocal('/b')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'read it' });
    await kernel.clock.advance(0);
    expect((await turnState(kernel, sessionId)).turn?.pending.map((item) => item.kind)).toEqual(['approval']);
    await answerFirst(kernel, sessionId);
    expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
    expect(toolResults(fake)).toEqual([expect.stringMatching(refusedLocal) as unknown, expect.stringMatching(refusedLocal) as unknown]);
  });

  it('QA63-H4 web is in the index, its name is kvcoder\'s own, and it can be turned off', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(systemPrompt(fake, 0)).toMatch(/\n- web: Read a page on the web[^\n]*\n {2}fetch \{ url \}\n {2}help {2}\{ command\? \}/);
    await expect(kernel.exec('kvcoder.connector.register', { name: 'web', description: 'Mine.', binary: { check: 'true' } }, { as: '@test/todo' })).rejects.toMatchObject({ problem: expect.objectContaining({ code: 'kvcoder/NAME_TAKEN' }) as unknown });
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.connectors.disabled', value: ['web'], scope: 'global' });
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    expect(systemPrompt(fake, 1)).not.toContain('\n- web: ');
  });

  it("QA63-E4 with never no fetch asks, and a read-only helper is refused a host its chat hasn't allowed", async () => {
    const never = await kvcoder.start({ settings: { 'kvcoder.approval': 'never' } });
    const quiet = await newSession(never.kernel);
    never.fake.reply(runs(fetchLocal('/a')), says('done'));
    await never.kernel.exec('kvcoder.message.send', { sessionId: quiet, text: 'go' });
    await never.kernel.clock.advance(0);
    expect(toolResults(never.fake)).toEqual([expect.stringMatching(refusedLocal) as unknown]);
    const world = await kvcoder.start({ settings: workers(worker('strict', { readOnly: true })) });
    await delegated(world, await newSession(world.kernel), [runs(command('delegate', 'run', { worker: 'strict', title: 'Reader', kind: 'find', goal: 'Read it', done: 'It is done.' })), says('Started.'), says('done')], [runs(fetchLocal('/a')), says('could not')]);
    expect(toolResults(world.helperFake, 1)[0]).toContain("This helper is read-only: its chat hasn't allowed 127.0.0.1");
  });

  it('QA63-E4 a read-only helper fetches from a host its chat allowed', async () => {
    const world = await kvcoder.start({ settings: { 'kvcoder.approval': 'auto', ...workers(worker('strict', { readOnly: true })) } });
    const { kernel, fake, helperFake } = world;
    const sessionId = await newSession(kernel);
    fake.reply(runs(fetchLocal('/a')), runs(command('delegate', 'run', { worker: 'strict', title: 'Reader', kind: 'find', goal: 'Read it', done: 'It is done.' })), says('Started.'), says('done'));
    helperFake.reply(runs(fetchLocal('/b')), says('read'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    await answerFirst(kernel, sessionId);
    expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
    // The helper's fetch reaches the address check, so the chat's allowed host let it run.
    expect(toolResults(helperFake, 1)).toEqual([expect.stringMatching(refusedLocal) as unknown]);
  });
});
