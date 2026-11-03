import { describe, expect, it, vi } from 'vitest';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { brief } from './support/workers.ts';

// A helper is told who it is: its run's title, on the first line of its system prompt (08 §8.2 and §8.5, ADR 0116).

const kvcoder = useKvcoder();

async function helperOf(worker: string, title: string) {
  const { kernel, fake, helperFake } = await kvcoder.start();
  const sessionId = await newSession(kernel);
  fake.reply(runs(command('delegate', 'run', brief(worker, { title }))), says('Started.'), says('Read it.'));
  helperFake.reply(says('Found it.'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'look into it' });
  await vi.waitFor(() => expect(helperFake.requests()).toHaveLength(1), wait);
  const helperId = /^started (\S+)/.exec(toolResults(fake, 1)[0] ?? '')?.[1] ?? '';
  return { kernel, helperId, prompt: systemPrompt(helperFake, 0) };
}

describe('a helper is told who it is (08 §8.2 and §8.5, ADR 0116)', { timeout: 30_000 }, () => {
  it("QA76-H1 the helper's first line is its run's title", async () => {
    const { prompt } = await helperOf('general', 'Node.js streams expert');
    expect(prompt.startsWith('You are the Node.js streams expert, doing one task that the lead agent gave you, in the folder ')).toBe(true);
    expect(prompt).not.toContain('You are kvman Coder');
  });

  it('QA76-H2 the whole title, while the person sees it cut at 60 characters', async () => {
    const title = `Expert in ${'x'.repeat(60)} streams and backpressure`;
    const { kernel, helperId, prompt } = await helperOf('general', title);
    expect(prompt.startsWith(`You are the ${title}, doing one task`)).toBe(true);
    expect((await kernel.exec('kvcoder.session.get', { sessionId: helperId })).title).toBe(`${title.slice(0, 59)}…`);
  });

  it("QA76-H3 a specialist's own instructions stay after the run's identity", async () => {
    const { prompt } = await helperOf('ui-ux', 'Vue accessibility expert');
    expect(prompt.startsWith('You are the Vue accessibility expert, doing one task that the lead agent gave you, ')).toBe(true);
    const worker = prompt.indexOf('## Worker: ui-ux\nYou are a senior UI/UX designer.');
    expect(worker).toBeGreaterThan(0);
  });
});
