import { describe, expect, it } from 'vitest';
import { decideLine } from '../src/prompt/build-prompt.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestTools, runs, says, shell, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';
import { delegated } from './support/helpers.ts';

const kvcoder = useKvcoder();

// "Decide for me" (08 §8.1 and §8.2, ADR 0092, 2): the chat has no ask, and the lead decides.
const connectorsOf = (tools: unknown[]): unknown => (tools[0] as { function?: { parameters?: { properties?: { connector?: { enum?: unknown } } } } }).function?.parameters?.properties?.connector?.enum;

describe('Decide for me (ADR 0092, 2)', { timeout: 30_000 }, () => {
  it('QA60-H3 a deciding chat has no ask, its prompt says so, and a call to ask is a connector that does not exist', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.session.configure', { sessionId, decides: true });
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).decides).toBe(true);
    fake.reply(runs(command('ask', 'text', { prompt: 'Name?' })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(systemPrompt(fake, 0)).not.toContain('\n- ask: ');
    expect(systemPrompt(fake, 0)).toContain(decideLine);
    expect(connectorsOf(requestTools(fake, 0))).not.toContain('ask');
    expect(toolResults(fake)[0]).toMatch(/^error VALIDATION_FAILED: There is no connector ask\./);
  });

  it('QA60-E1 off again brings ask back from the next step', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.session.configure', { sessionId, decides: true });
    await kernel.exec('kvcoder.session.configure', { sessionId, decides: false });
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(systemPrompt(fake, 0)).toContain('\n- ask: ');
    expect(systemPrompt(fake, 0)).not.toContain(decideLine);
  });

  it('QA60-E2 approvals still ask while the chat decides', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.approval': 'auto' } });
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.session.configure', { sessionId, decides: true });
    fake.reply(runs(shell('touch x', { risky: true })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect((await turnState(kernel, sessionId)).turn?.pending.map((item) => item.kind)).toEqual(['approval']);
  });

  it("QA60-E3 a deciding chat's helper is unaffected", async () => {
    const world = await kvcoder.start({ settings: workers(worker('helper')) });
    const sessionId = await newSession(world.kernel);
    await world.kernel.exec('kvcoder.session.configure', { sessionId, decides: true });
    await delegated(world, sessionId, [runs(command('delegate', 'run', { worker: 'helper', title: 'Helper', kind: 'find', goal: 'Do it', done: 'It is done.' })), says('Started.'), says('ok')], [says('done')]);
    const helper = systemPrompt(world.helperFake, 0);
    expect(helper).toContain('working on one task that the lead agent gave you');
    expect(helper).not.toContain(decideLine);
    expect(helper).not.toContain('\n- ask: ');
  });
});
