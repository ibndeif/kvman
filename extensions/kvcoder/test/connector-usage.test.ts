import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

async function resultOf(call: RunCallSpec): Promise<string> {
  const { kernel, fake } = await kvcoder.start();
  const sessionId = await newSession(kernel);
  fake.reply(runs(call), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake)[0] ?? '';
}

describe("a built-in connector's invalid payload says what the command takes (08 §8.3, ADR 0012, 2)", { timeout: 30_000 }, () => {
  it('QA11-H6 artifact, ask, fs, and delegate show the payload signature of the command that failed', async () => {
    const artifact = await resultOf(command('artifact', 'write', { name: 'todo-app' }));
    expect(artifact).toContain('id: ');
    expect(artifact).toContain('title: ');
    expect(artifact).toContain('payload: Unrecognized key: "name"');
    expect(artifact.includes('The payload of artifact write is\n{ id (≤50), title (≤100), format?: "markdown" | "html" | "url", content }\n\n')).toBe(true);
    const choice = await resultOf(command('ask', 'choice', { question: 'Which?', choices: ['a', 'b'] }));
    expect(choice.includes('The payload of ask choice is\n{ prompt, multiple, options: [{ id, label, description? }], other? }\n\n')).toBe(true);
    const file = await resultOf(fsCall('write', { content: 'x' }));
    expect(file.includes('The payload of fs write is\n{ path, content, risky }\n\n')).toBe(true);
    const helper = await resultOf(command('delegate', 'run', { worker: 'general',  prompt: 'x' }));
    expect(helper.includes('The payload of delegate run is\n{ worker, title (≤200), kind: "find" | "change" | "check" | "review", goal (≤300), done (≤300), files?, context?: [{ path, fromLine?, lines? }], budget? }\n\n')).toBe(true);
  });

  it('QA11-E6 a valid call gets no signature', async () => {
    const written = await resultOf(command('artifact', 'write', { id: 'plan', title: 'Plan', content: '# Plan' }));
    expect(written).not.toContain('The payload of');
    expect(written).toContain('"created":true');
    const file = await resultOf(fsCall('write', { path: 'a.txt', content: 'x' }));
    expect(file).not.toContain('The payload of');
  });
});
