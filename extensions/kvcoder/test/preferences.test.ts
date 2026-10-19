import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

// The person's preferences in every prompt (08 §8.2, ADR 0092, 3).
const opening = "## The person's preferences\nThese are the person's own standing preferences for every chat. Follow them unless the person says otherwise in this chat.";

describe("the person's preferences (ADR 0092, 3)", { timeout: 30_000 }, () => {
  it('QA60-H5 the lead and a helper read them right after the base prompt, before the other sections', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { ...workers(worker('helper')), 'kvcoder.preferences': 'Build apps in Arabic first.' } });
    writeFileSync(path.join(kernel.homeFolder, 'AGENTS.md'), '# Rules\nUse pnpm.\n');
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'helper', title: 'Helper', task: 'Do it' })), says('done'), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    for (const index of [0, 1]) {
      const prompt = systemPrompt(fake, index);
      expect(prompt).toContain(`${opening}\n\nBuild apps in Arabic first.`);
      expect(prompt.indexOf(opening)).toBeLessThan(prompt.indexOf('## Project rules: AGENTS.md'));
      expect(prompt.indexOf(opening)).toBeGreaterThan(prompt.indexOf('How you work.'));
    }
  });

  it('QA60-H5 no section when they are empty', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(systemPrompt(fake, 0)).not.toContain("The person's preferences");
  });

  it("QA60-E5 the workspace's value wins, and more than 16 KB is refused", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.preferences': 'Global wish.' } });
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.preferences', value: 'Workspace wish.', scope: 'workspace' });
    await expect(kernel.exec('kernel.settings.set', { key: 'kvcoder.preferences', value: 'x'.repeat(16_385), scope: 'global' })).rejects.toMatchObject({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) as unknown });
    const sessionId = await newSession(kernel);
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(systemPrompt(fake, 0)).toContain('Workspace wish.');
    expect(systemPrompt(fake, 0)).not.toContain('Global wish.');
  });
});
