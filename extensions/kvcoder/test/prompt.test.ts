import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says, systemPrompt } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('the prompt (08 §8.2, §8.4)', { timeout: 30_000 }, () => {
  it('M2.4-E36 binary checks run at the first step and are stored; only passing ones are listed; a setting entry with a registered name is ignored', async () => {
    const settings = {
      'kvcoder.connectors': [
        { name: 'works', description: 'A program that is there.', binary: { check: 'true' } },
        { name: 'missing', description: 'A program that is not.', binary: { check: 'exit 3' } },
        { name: 'todo', description: 'Clashes with the registered connector.', binary: { check: 'true' } },
      ],
    };
    const { kernel, fake } = await kvcoder.start({ settings });
    await kernel.exec('kvcoder.connector.register', { name: 'gh', description: 'GitHub CLI.', binary: { check: 'true', install: 'https://cli.github.com' } }, { as: '@test/todo' });
    expect((await kernel.exec('kvcoder.connector.list', {})).map((connector) => `${connector.name}:${connector.owner}`).sort()).toEqual(['gh:@test/todo', 'missing:kvcoder.connectors', 'todo:@test/todo', 'works:kvcoder.connectors']);
    const sessionId = await newSession(kernel);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).checks).toBeUndefined();
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).checks).toEqual(expect.arrayContaining([{ name: 'gh', passed: true }, { name: 'works', passed: true }, { name: 'missing', passed: false }]));
    const prompt = systemPrompt(fake);
    expect(prompt).toContain('- works: A program that is there.');
    expect(prompt).toContain('- gh: GitHub CLI.');
    expect(prompt).not.toContain('- missing:');
    expect(prompt).not.toContain('Clashes');
  });

  it("M2.4-E53 and QA4-H15 the base prompt names the shell, the OS, the language, and the workspace folder; then sections by order; then the connector index", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kernel.language': 'ar' } });
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.section.set', { id: 'later', title: 'Later', order: 30, content: 'L' }, { as: '@test/todo' });
    await kernel.exec('kvcoder.section.set', { id: 'mine', title: 'Mine', order: 5, content: 'M', sessionId }, { as: '@test/todo' });
    await kernel.exec('kvcoder.section.set', { id: 'everywhere', title: 'Everywhere', order: 10, content: 'E', global: true }, { as: '@test/todo' });
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const prompt = systemPrompt(fake);
    expect(prompt).toBe((await kernel.exec('kvcoder.prompt.get', { sessionId })).prompt);
    const system = new Map([['linux', 'Linux'], ['darwin', 'macOS'], ['win32', 'Windows']]).get(process.platform);
    expect(prompt).toContain(`in the folder ${kernel.homeFolder} on ${String(system)}`);
    expect(prompt).toContain('Reply in Arabic (ar) unless the person writes in another language.');
    const tool = process.platform === 'win32' ? 'powershell: it runs a PowerShell command' : 'bash: it runs a bash command';
    expect(prompt).toContain(`Your one tool is ${tool}. Each call starts in the workspace folder, so cd doesn't carry over to the next call.`);
    expect(prompt).toContain('- ask: Ask the person a question and wait for the answer (commands: text, choice, confirm).');
    expect(prompt).toContain('- subagent: Run helper agents on tasks, in parallel or in the background (command: run).');
    expect(prompt).toContain('- jobs: List, check, or cancel the background work this chat started (commands: list, get, cancel).');
    expect(prompt).toContain('- fs: Create, replace, or edit files inside the workspace folder (commands: write, edit).');
    expect(prompt).toContain('- todo: Keep a todo list.\n');
    const order = ['## Mine', '## Everywhere', '## Later', '## Connectors', '- todo: Keep a todo list.', '- ask: ', '- subagent: ', '- jobs: '].map((part) => prompt.indexOf(part));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((first, second) => first - second)).toEqual(order);
  });
});
