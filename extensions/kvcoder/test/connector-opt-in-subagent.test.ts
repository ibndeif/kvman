import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

// The connector names of a prompt's index, in order.
function indexed(prompt: string): (string | undefined)[] {
  const lines = (prompt.split('## Connectors\n')[1] ?? '').split('\n');
  return lines.filter((line) => line.startsWith('- ')).map((line) => /^- ([\w-]+): /.exec(line)?.[1]);
}

describe("a subagent and its chat's optIn connectors (08 §8.4, ADR 0027, 10)", { timeout: 30_000 }, () => {
  it('QA39-E17 a subagent has an optIn connector its worker lists only when its top-level session enabled it', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('helper', { connectors: ['todo', 'notes'] })) });
    await kernel.exec('kvcoder.connector.register', { name: 'notes', description: 'Notes.', optIn: true, commands: [{ name: 'add', command: 'todo.item.add' }] }, { as: '@test/todo' });
    const delegated = () => fake.reply(runs(command('delegate', 'run', { worker: 'helper', task: 'Review' })), says('child done'), says('parent done'));

    const without = await newSession(kernel);
    delegated();
    await kernel.exec('kvcoder.message.send', { sessionId: without, text: 'go' });
    await kernel.clock.advance(0);
    expect(indexed(systemPrompt(fake, 1))).toEqual(['ask', 'todo']);

    const enabled = await newSession(kernel);
    await kernel.exec('kvcoder.connector.enable', { sessionId: enabled, names: ['notes'] }, { as: '@test/todo' });
    delegated();
    await kernel.exec('kvcoder.message.send', { sessionId: enabled, text: 'go' });
    await kernel.clock.advance(0);
    expect(indexed(systemPrompt(fake, 4))).toEqual(['ask', 'todo', 'notes']);
  });
});
