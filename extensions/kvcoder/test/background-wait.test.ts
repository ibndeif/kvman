import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// The lines here are bash, the Linux and macOS branch.
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These lines are bash; Windows runs PowerShell.');
}

async function say(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, ...calls: RunCallSpec[]): Promise<string[]> {
  fake.reply(runs(...calls), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake).slice(-calls.length);
}

const idOf = (started: string): string => /^started (\S+)/.exec(started)?.[1] ?? '';
const parsed = (text: string | undefined) => JSON.parse(text ?? 'null') as Record<string, unknown>;

describe('waiting for a background run, and reading less of it (08 §8.5, ADR 0068)', { timeout: 60_000 }, () => {
  it('M2.4-E238 wait returns when the run ends, and with the status running when its time passes first', async () => {
    posixShell();
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const [quick = ''] = await say(kernel, fake, sessionId, shell('echo up; sleep 2; echo down', { background: true }));
    const began = Date.now();
    const [waited] = await say(kernel, fake, sessionId, command('background', 'wait', { id: idOf(quick) }));
    expect(parsed(waited)).toMatchObject({ id: idOf(quick), kind: 'process', call: 'echo up; sleep 2; echo down', status: 'succeeded', exitCode: 0, output: 'up\ndown' });
    expect(Date.now() - began).toBeLessThan(20_000);
    const [slow = ''] = await say(kernel, fake, sessionId, shell('sleep 30', { background: true }));
    const [still] = await say(kernel, fake, sessionId, command('background', 'wait', { id: idOf(slow), timeoutMs: 1000 }));
    expect(parsed(still)).toMatchObject({ id: idOf(slow), status: 'running' });
    await say(kernel, fake, sessionId, command('background', 'stop', { id: idOf(slow) }));
  });

  it("M2.4-E239 wait refuses an id the chat didn't start, and a time out of range", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const [unknown = '', short = '', long = ''] = await say(kernel, fake, sessionId, command('background', 'wait', { id: 'nope' }), command('background', 'wait', { id: 'nope', timeoutMs: 10 }), command('background', 'wait', { id: 'nope', timeoutMs: 600_001 }));
    expect(unknown).toMatch(/^error kvcoder\/JOB_NOT_FOUND: /);
    for (const refused of [short, long]) expect(refused).toMatch(/^error VALIDATION_FAILED: timeoutMs: /);
  });

  it('M2.4-E240 and QA57-H4 list gives short rows titled by the line, and output takes the number of lines', async () => {
    posixShell();
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const line = `echo one; echo two; echo three; sleep 30 # ${'so that the title is long '.repeat(3)}`.trim();
    const [started = ''] = await say(kernel, fake, sessionId, shell(line, { background: true }));
    const [list, tail] = await say(kernel, fake, sessionId, command('background', 'list'), command('background', 'output', { id: idOf(started), lines: 2 }));
    const [row] = JSON.parse(list ?? '[]') as Record<string, unknown>[];
    expect(Object.keys(row ?? {}).sort()).toEqual(['id', 'kind', 'startedAt', 'status', 'title']);
    expect(row).toMatchObject({ id: idOf(started), kind: 'process', status: 'running', title: `${line.slice(0, 79)}…` });
    expect(parsed(tail)).toMatchObject({ call: line, output: 'two\nthree' });
    await say(kernel, fake, sessionId, command('background', 'stop', { id: idOf(started) }));
  });
});
