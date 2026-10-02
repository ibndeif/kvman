import { describe, expect, it } from 'vitest';
import { invalidInput } from '../src/calls/invalid-input.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

async function resultOf(command: string): Promise<string> {
  const { kernel, fake } = await kvcoder.start();
  const sessionId = await newSession(kernel);
  fake.reply(calls(command), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake)[0] ?? '';
}

describe("a built-in connector's invalid input says what the command takes (08 §8.3, ADR 0009, 213)", { timeout: 30_000 }, () => {
  it('QA11-H6 artifact, ask, fs, and subagent name the input of the command that failed', async () => {
    const artifact = await resultOf(`artifact write '{"name":"todo-app"}' <<'EOF'\n<p>hi</p>\nEOF`);
    expect(artifact).toContain('id: ');
    expect(artifact).toContain('title: ');
    expect(artifact).toContain('input: Unrecognized key: "name"');
    expect(artifact).toContain('`artifact write` takes \'{ "id", "title", "format"?, "content" }\'');
    const choice = await resultOf(`ask choice '{"question":"Which?","choices":["a","b"]}'`);
    expect(choice).toContain('`ask choice` takes \'{ "prompt", "multiple", "options"');
    const file = await resultOf(`fs write '{"content":"x"}'`);
    expect(file).toContain('`fs write` takes \'{ "path", "content" }\'');
    const helper = await resultOf(`subagent run '{"prompt":"x"}'`);
    expect(helper).toContain('`subagent run` takes \'{ "task", "mode"');
  });

  it('QA11-E5 a command with no usage line in the help gets the problems alone', () => {
    expect(invalidInput('jobs', 'nothing', [{ path: ['id'], message: 'Invalid input' }, { path: [], message: 'Unrecognized key: "name"' }])).toEqual({ output: 'error VALIDATION_FAILED: id: Invalid input; input: Unrecognized key: "name"', exitCode: 1 });
  });

  it('QA11-E6 a valid call gets no usage line', async () => {
    const written = await resultOf(`artifact write '{"id":"plan","title":"Plan","content":"# Plan"}'`);
    expect(written).not.toContain('takes');
    expect(written).toContain('"created": true');
    const file = await resultOf(`fs write '{"path":"a.txt","content":"x"}'`);
    expect(file).not.toContain('takes');
  });
});
