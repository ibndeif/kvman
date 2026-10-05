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

describe("a built-in connector's invalid payload says what the command takes (08 §8.3, ADR 0009, 213)", { timeout: 30_000 }, () => {
  it('QA11-H6 artifact, ask, fs, and subagent show the payload schema of the command that failed', async () => {
    const artifact = await resultOf(command('artifact', 'write', { name: 'todo-app' }));
    expect(artifact).toContain('id: ');
    expect(artifact).toContain('title: ');
    expect(artifact).toContain('payload: Unrecognized key: "name"');
    expect(artifact).toContain('The payload of artifact write is (JSON Schema):');
    const choice = await resultOf(command('ask', 'choice', { question: 'Which?', choices: ['a', 'b'] }));
    expect(choice).toMatch(/The payload of ask choice is \(JSON Schema\):[\s\S]*"options"/);
    const file = await resultOf(fsCall('write', { content: 'x' }));
    expect(file).toMatch(/The payload of fs write is \(JSON Schema\):[\s\S]*"path"/);
    const helper = await resultOf(command('subagent', 'run', { prompt: 'x' }));
    expect(helper).toMatch(/The payload of subagent run is \(JSON Schema\):[\s\S]*"task"/);
  });

  it('QA11-E6 a valid call gets no schema', async () => {
    const written = await resultOf(command('artifact', 'write', { id: 'plan', title: 'Plan', content: '# Plan' }));
    expect(written).not.toContain('JSON Schema');
    expect(written).toContain('"created": true');
    const file = await resultOf(fsCall('write', { path: 'a.txt', content: 'x' }));
    expect(file).not.toContain('JSON Schema');
  });
});
