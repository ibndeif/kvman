import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

async function say(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, ...calls: RunCallSpec[]): Promise<string[]> {
  fake.reply(runs(...calls), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake).slice(-calls.length);
}

const idOf = (started: string): string => /^started (\S+)/.exec(started)?.[1] ?? '';
const parsed = (text: string | undefined) => JSON.parse(text ?? 'null') as Record<string, unknown>;

describe('numbers that bound how long or how much are cut (08 §8.5, ADR 0090, 4)', { timeout: 60_000 }, () => {
  it('QA58-H6 background wait and output cut their numbers into range instead of refusing them', async () => {
    if (process.platform === 'win32') throw new Error('These lines are bash; Windows runs PowerShell.');
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const [printer = '', slow = ''] = await say(kernel, fake, sessionId, shell('for n in $(seq 1 600); do echo line $n; done', { background: true }), shell('sleep 30', { background: true }));
    const [ended, waited, tail] = await say(
      kernel,
      fake,
      sessionId,
      command('background', 'wait', { id: idOf(printer), timeoutMs: 900_000 }),
      command('background', 'wait', { id: idOf(slow), timeoutMs: 500 }),
      command('background', 'output', { id: idOf(printer), lines: 900 }),
    );
    expect(parsed(ended)).toMatchObject({ status: 'succeeded' });
    expect(parsed(waited)).toMatchObject({ status: 'running' });
    const output = String(parsed(tail)['output']).split('\n');
    expect(output).toHaveLength(500);
    expect(output.at(-1)).toBe('line 600');
    await say(kernel, fake, sessionId, command('background', 'stop', { id: idOf(slow) }));
  });
});
