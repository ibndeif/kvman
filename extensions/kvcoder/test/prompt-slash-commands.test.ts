import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { helperIds } from './support/helpers.ts';
import { command, runs, says, shell } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { brief } from './support/workers.ts';

// The lead is told the slash commands the person can type (plan 08 §8.2, ADR 0119, 3).

const kvcoder = useKvcoder();
const intro = "The person can type these in the send box to turn on more in this chat. When they ask for what one of them is for and it isn't on in this chat, tell them to type it instead of doing that work another way.";

describe("the lead's slash commands block (ADR 0119, 3)", { timeout: 30_000 }, () => {
  it("QA78-E3 a line per slash command, by name, with its command's English description", async () => {
    const { kernel } = await kvcoder.start();
    const run = 'todo.list.start';
    await kernel.exec('kvcoder.slash.register', { commands: [{ name: 'b', description: 'todo.slash.b', command: run }, { name: 'a', description: 'todo.slash.a', command: run }] }, { as: '@test/todo' });
    const { prompt } = await kernel.exec('kvcoder.prompt.get', { sessionId: await newSession(kernel) });
    expect(prompt.endsWith(['## Slash commands', intro, '- /a: Starts a todo list from a slash command.', '- /b: Starts a todo list from a slash command.'].join('\n'))).toBe(true);
    expect(prompt).not.toContain('todo.slash.');
  });

  it('QA78-E2 no slash commands, no block', async () => {
    const { kernel } = await kvcoder.start();
    const { prompt } = await kernel.exec('kvcoder.prompt.get', { sessionId: await newSession(kernel) });
    expect(prompt).not.toContain('## Slash commands');
  });

  it("QA78-E1 a helper isn't told the slash commands", async () => {
    const world = await kvcoder.start();
    const { kernel } = world;
    await kernel.exec('kvcoder.slash.register', { commands: [{ name: 'a', description: 'todo.slash.a', command: 'todo.list.start' }] }, { as: '@test/todo' });
    const sessionId = await newSession(kernel);
    world.fake.reply(runs(command('delegate', 'run', brief('general', { kind: 'check', goal: 'Wait' }) as never)), says('Started.'));
    world.helperFake.reply(runs(shell('true', { risky: true })));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [childId = ''] = await helperIds(kernel, sessionId);
    expect((await kernel.exec('kvcoder.prompt.get', { sessionId })).prompt).toContain('## Slash commands');
    expect((await kernel.exec('kvcoder.prompt.get', { sessionId: childId })).prompt).not.toContain('## Slash commands');
  });
});
