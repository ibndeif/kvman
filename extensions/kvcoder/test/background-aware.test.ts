import { describe, expect, it } from 'vitest';
import { workingMethod } from '../src/prompt/working-method.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, shell, systemPrompt, textOf, toolResults, unstamped } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// The lines here are bash, the Linux and macOS branch.
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These lines are bash; Windows runs PowerShell.');
}

describe('the agent knows what runs in the background (08 §8.5, ADR 0068, 4 and 5)', { timeout: 60_000 }, () => {
  it("M2.4-E241 the person's message carries what still runs, and nothing when nothing does", async () => {
    posixShell();
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs({ ...shell('sleep 30', { background: true }), description: 'Serves the app.' }), says('started'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'start it' });
    await kernel.clock.advance(0);
    const id = /^started (\S+)/.exec(toolResults(fake)[0] ?? '')?.[1] ?? '';
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'what now?' });
    await kernel.clock.advance(0);
    const people = (await kernel.exec('kvcoder.message.list', { sessionId, limit: 50 })).messages.filter((message) => message.kind === 'user');
    expect(people.map((message) => message.content['running'])).toEqual([undefined, [`${id} (process): Serves the app.`]]);
    expect(people.map((message) => message.content['content'])).toEqual(['start it', 'what now?']);
    const sent = requestMessages(fake).filter((message) => message.role === 'user').map((message) => unstamped(textOf(message)));
    expect(sent).toEqual(['start it', `what now?\n\n[kvman: still running in the background: ${id} (process): Serves the app.. Use the background connector to wait for, read, or stop one.]`]);
    fake.reply(runs(command('background', 'stop', { id })), says('stopped'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'stop it' });
    await kernel.clock.advance(0);
  });

  it('M2.4-E242 the prompt lists wait and says to wait once in place of asking again', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const prompt = systemPrompt(fake, 0);
    expect(prompt).toContain('Use it to see its status or output, to wait for it to end, or to stop it. When you need a run\'s result before you can go on, call wait once');
    expect(prompt).toMatch(/\n {2}list +\{\}\n {2}output +\{ id, lines\? \}\n {2}wait +\{ id, timeoutMs\? \}\n {2}stop +\{ id \}\n {2}help +\{ command\? \}/);
    for (const role of ['lead', 'worker'] as const) expect(workingMethod(role), role).toContain("When you need a background run's result before you can go on, call `background wait` once; don't ask for its output again and again, and a run that ends tells you in a message.");
  });
});
