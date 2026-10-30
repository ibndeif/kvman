import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';
import { delegated } from './support/helpers.ts';

const kvcoder = useKvcoder();
const identity = 'You are a research assistant for PhD students.';

describe("a preset's agent profile (08 §8.2, ADR 0082, 11)", { timeout: 30_000 }, () => {
  it('QA52-H11 a profile gives the lead and its helper another identity and the general method, with no execution map', async () => {
    const world = await kvcoder.start({ settings: { ...workers(worker('reader')), 'kvcoder.profile': { identity, method: 'general' } } });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, [runs(command('execution-map', 'get', {})), runs(command('delegate', 'run', { worker: 'reader', title: 'Helper', kind: 'find', goal: 'Look.', done: 'It is done.' })), says('Started.'), says('parent done')], [says('child done')]);
    const lead = systemPrompt(world.fake, 0);
    expect(lead.startsWith(`${identity} You work in the folder `)).toBe(true);
    expect(lead).toContain('How you work. Understand what the person wants:');
    expect(lead).toContain("Use the simplest way that does what was asked, and don't add what wasn't asked.");
    for (const engineering of ['kvman Coder', '\nPlan.', 'execution-map', 'ready for production', 'add a short Commands section']) expect(lead, engineering).not.toContain(engineering);
    expect(toolResults(world.fake, 1)[0]).toMatch(/^error VALIDATION_FAILED: There is no connector execution-map/);
    const child = systemPrompt(world.helperFake, 0);
    expect(child.startsWith(`${identity} You are doing one task that the lead agent gave you, in the folder `)).toBe(true);
    expect(child).toContain('2. Do it. Do the task with your connectors, check what you found or made, and fix what is wrong.');
    expect(child).not.toContain('kvman Coder');
  });

  it('QA52-E9 the profile is preset-only and strict, and with none the prompts are as before', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const lead = systemPrompt(fake, 0);
    expect(lead.startsWith('You are kvman Coder, the lead engineer on this work')).toBe(true);
    // Plan is part of Map since QA73-H5 (ADR 0112, 3).
    expect(lead).toContain('\nMap. Only when your path needs one, after you understood the request');
    expect(lead).toContain('- execution-map: ');
    await expect(kernel.exec('kernel.settings.set', { key: 'kvcoder.profile', value: { method: 'general' }, scope: 'global' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    for (const profile of [{ other: true }, { identity: '' }, { method: 'casual' }]) {
      await expect(kvcoder.start({ settings: { 'kvcoder.profile': profile } })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    }
  });
});
