import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';
import { delegated } from './support/helpers.ts';

const kvcoder = useKvcoder();

describe('the prompt of a chat and of its subagent (08 §8.2 and §8.5, ADR 0022, 3)', { timeout: 30_000 }, () => {
  it("QA33-H9 a chat's prompt is the lead's, and a subagent's is the worker's, followed by its worker's instructions", async () => {
    const world = await kvcoder.start({ settings: workers(worker('reader', { instructions: 'Read only.' })) });
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, [runs(command('delegate', 'run', { worker: 'reader', title: 'Helper', kind: 'find', goal: 'Read the notes.', done: 'It is done.' })), says('Started.'), says('parent done')], [says('child done')]);
    const lead = systemPrompt(world.fake, 0);
    expect(lead).toContain('the lead engineer on this work');
    expect(lead).toContain('\nFinish. The work is done when it is ready for production');
    expect(lead).not.toContain('that the lead agent gave you');
    expect(lead).toBe((await world.kernel.exec('kvcoder.prompt.get', { sessionId })).prompt);
    const child = systemPrompt(world.helperFake, 0);
    expect(child).toContain('working on one task that the lead agent gave you');
    expect(child).toContain('3. Return.');
    expect(child).not.toContain('the lead engineer on this work');
    expect(child).not.toContain('6. Finish.');
    expect(child.indexOf('## Worker: reader\nRead only.')).toBeGreaterThan(child.indexOf('3. Return.'));
    expect(child.indexOf('## Connectors')).toBeGreaterThan(child.indexOf('## Worker: reader'));
  });

  it('QA53-H14 the prompt confirms less and names read-only workers (ADR 0085, 7 and 9)', async () => {
    const { kernel } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const { prompt } = await kernel.exec('kvcoder.prompt.get', { sessionId });
    expect(prompt).toMatch(/architect \([^()]*; read-only\)/);
    expect(prompt).toMatch(/reviewer \([^()]*; read-only\)/);
    expect(prompt).toMatch(/general \(Any separate, self-contained task\)/);
    // Worded as Map's agreement since QA73-H6 and E5 (ADR 0112, 3).
    expect(prompt).toContain('A map set again with a change to what the person gets (the goal, what done looks like, what stays as it is, stored data, or what could go wrong) needs their agreement again');
    expect(prompt).toContain("a change inside the plan (who does a step, the order, a step split or retried, or a worker reassigned) or of a step's status needs none: say what changed in one line.");
    expect(prompt).toContain('answers what it covers: never ask it again.');
  });
});
