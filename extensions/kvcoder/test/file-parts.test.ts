import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();
const inHome = (kernel: TestKernel, file: string) => path.join(kernel.homeFolder, file);
const part = (file: string, number: number, content: string) => command('fs', 'part', { path: file, part: number, content });
const json = z.object({ parts: z.array(z.number()) });
const assemble = (file: string) => command('fs', 'assemble', { path: file, risky: false });
async function send(kernel: TestKernel, sessionId: string): Promise<void> {
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
}

describe('a long file is written in parts (KVC-14, ADR 0054)', { timeout: 30_000 }, () => {
  it('M2.4-E164 pieces in any order, one sent twice, assemble into the file once, and are then gone', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.shell.approval': 'ask' } });
    const sessionId = await newSession(kernel);
    fake.reply(runs(part('big.txt', 2, 'two\n'), part('big.txt', 1, 'draft\n')), runs(part('big.txt', 3, 'three\n'), part('big.txt', 1, 'one\n')), runs(assemble('big.txt')), runs(assemble('big.txt')), says('done'));
    await send(kernel, sessionId);
    expect((await turnState(kernel, sessionId)).turn?.pending.map((item) => item.kind)).toEqual(['approval']);
    expect(existsSync(inHome(kernel, 'big.txt'))).toBe(false);
    // The two pieces of one reply are saved at the same time, so either result may be the one that sees all three.
    expect(toolResults(fake, 2).slice(-2).map((result) => JSON.stringify(json.parse(JSON.parse(result)).parts))).toContain('[1,2,3]');
    const [first] = (await turnState(kernel, sessionId)).turn?.pending ?? [];
    await kernel.exec('kvcoder.question.answer', { questionId: String(first?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    expect(readFileSync(inHome(kernel, 'big.txt'), 'utf8')).toBe('one\ntwo\nthree\n');
    expect(JSON.parse(String(toolResults(fake, 3).at(-1)))).toEqual({ path: 'big.txt', created: true, bytes: 14, parts: 3 });
    const [second] = (await turnState(kernel, sessionId)).turn?.pending ?? [];
    await kernel.exec('kvcoder.question.answer', { questionId: String(second?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    expect(toolResults(fake).at(-1)).toMatch(/^error NOT_FOUND: This chat holds no parts of big\.txt\./);
  });

  it('M2.4-E165 a missing piece, a piece too large, a bad number, and an unread existing file all refuse', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    writeFileSync(inHome(kernel, 'there.txt'), 'already');
    fake.reply(runs(part('gap.txt', 1, 'a'), part('gap.txt', 3, 'c'), part('gap.txt', 2, 'x'.repeat(64 * 1024 + 1)), part('gap.txt', 0, 'z'), part('gap.txt', 201, 'z'), part('there.txt', 1, 'new')), runs(assemble('gap.txt'), assemble('there.txt')), says('done'));
    await send(kernel, sessionId);
    const saved = toolResults(fake, 1);
    expect(saved[2]).toMatch(/^error TOO_LARGE: /);
    expect(saved[3]).toMatch(/^error VALIDATION_FAILED: part/);
    expect(saved[4]).toMatch(/^error VALIDATION_FAILED: part/);
    const [gap, there] = toolResults(fake).slice(-2);
    expect(gap).toMatch(/^error VALIDATION_FAILED: gap\.txt is missing part 2\./);
    expect(there).toMatch(/^error VALIDATION_FAILED: there\.txt exists and this chat hasn't read it/);
    expect(existsSync(inHome(kernel, 'gap.txt'))).toBe(false);
    expect(readFileSync(inHome(kernel, 'there.txt'), 'utf8')).toBe('already');
  });
});
