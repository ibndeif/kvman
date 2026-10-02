import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says, systemPrompt } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('the prompt (08 §8.2, §8.4)', { timeout: 30_000 }, () => {
  it('M2.4-E36 and QA5-E5 binary checks run at the first step and are stored; only passing ones are listed; a setting entry with a registered name is ignored', async () => {
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
    expect(prompt).toContain('- works: A program that is there. Help: `works -h`.');
    expect(prompt).toContain('- gh: GitHub CLI. Help: `gh -h`.');
    expect(prompt).not.toContain('- missing:');
    expect(prompt).not.toContain('Clashes');
    expect(prompt).toContain('## Connectors\nUse these before the shell, whenever one covers the task.\n');
  });

  it("M2.4-E53, QA4-H15, QA4-H16, QA4-H17, QA5-H1, QA5-H3, QA5-H5, QA5-E3, QA6-H22, QA6-H23, and QA8-H5 the base prompt names the shell, the OS, the language, and the workspace folder; then sections by order; then the connector index", async () => {
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
    expect(prompt).toContain('- ask: Put a question to the person and wait for the answer. Use it when you need a decision, a missing detail, or a go-ahead before a risky step, instead of guessing (commands: text, choice, confirm). Help: `ask -h`.');
    expect(prompt).toContain('- subagent: Hand a self-contained task to a helper agent. Use it to research or build a separate part in parallel, or in the background while you go on (command: run). Help: `subagent -h`.');
    expect(prompt).toContain('- jobs: Check on background work you started, a server from mode "async" or a --async call. Use it to see its status or output, or to stop it (commands: list, get, cancel). Help: `jobs -h`.');
    expect(prompt).toContain('- fs: Create and change files in the workspace folder. Use it for every file you create or change: write for a new file or a full rewrite, giving the content as the raw heredoc body after `{"path"}`, one file per call, and edit for exact text replacements in an existing file (commands: write, edit). Help: `fs -h`.');
    expect(prompt).toContain('Connectors come first. A connector is a word kvcoder runs itself');
    expect(prompt).toContain('Write the plan as the artifact `plan`');
    expect(prompt).toContain('Write each file in its own call, with its content as the raw heredoc body of `fs write`.');
    expect(prompt).toContain('- artifact: Show the person something to read or see: a plan, a report, a design, an HTML page, or the localhost address of an app you are running (format url). Use it for anything longer than a few lines instead of pasting it into a reply, and keep your plan in the artifact `plan`. Give the content as the raw heredoc body after the JSON (commands: write, edit, get). Help: `artifact -h`.');
    expect(prompt).toContain('## Connectors\nUse these before the shell, whenever one covers the task.\n- todo: Keep a todo list.');
    expect(prompt).toContain("- todo: Keep a todo list. Help: `todo -h` lists its commands; `todo <command> -h` shows a command's input, output, and examples.\n");
    const order = ['## Mine', '## Everywhere', '## Later', '## Connectors', '- todo: Keep a todo list.', '- ask: ', '- subagent: ', '- jobs: '].map((part) => prompt.indexOf(part));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((first, second) => first - second)).toEqual(order);
  });
});
