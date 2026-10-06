import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

describe('the prompt of a chat and of its subagent (08 §8.2 and §8.5, ADR 0022, 3)', { timeout: 30_000 }, () => {
  it("QA33-H9 a chat's prompt is the lead's, and a subagent's is the worker's, followed by its worker's instructions", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('reader', { instructions: 'Read only.' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'reader', task: 'Read the notes.' })), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);

    const lead = systemPrompt(fake, 0);
    expect(lead).toContain('the lead engineer on this work');
    expect(lead).toContain('6. Finish.');
    expect(lead).not.toContain('that the lead agent gave you');
    expect(lead).toBe((await kernel.exec('kvcoder.prompt.get', { sessionId })).prompt);

    const child = systemPrompt(fake, 1);
    expect(child).toContain('working on one task that the lead agent gave you');
    expect(child).toContain('3. Return.');
    expect(child).not.toContain('the lead engineer on this work');
    expect(child).not.toContain('6. Finish.');
    expect(child.indexOf('## Worker: reader\nRead only.')).toBeGreaterThan(child.indexOf('3. Return.'));
    expect(child.indexOf('## Connectors')).toBeGreaterThan(child.indexOf('## Worker: reader'));
  });
});
