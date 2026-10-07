import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useLooked } from './support/looked.ts';
import { command, toolResults, type RunCallSpec } from './support/model-script.ts';
import { turnState } from './support/turns.ts';

const looked = useLooked();

const node = { name: 'node', description: 'Node.js.', binary: { check: 'node --version' } };
const settings = (approval: 'auto' | 'ask') => ({ 'kvcoder.shell.approval': approval, 'kvcoder.connectors': [node] }) as unknown as Record<string, string>;
const prepare = (): void => undefined;

// The four commands that can ask, each making its own file: `risky` is merged into the payload.
const asking = (risky: Record<string, boolean>): RunCallSpec[] => [
  command('shell', 'exec', { line: 'node -e "require(\'fs\').writeFileSync(\'shell.txt\', \'x\')"', ...risky }),
  command('node', 'exec', { args: '-e "require(\'fs\').writeFileSync(\'binary.txt\', \'x\')"', ...risky }),
  command('fs', 'write', { path: 'write.txt', content: 'x', ...risky }),
  command('fs', 'edit', { path: 'seed.txt', edits: [{ oldText: 'old', newText: 'new' }], ...risky }),
];
const made = ['shell.txt', 'binary.txt', 'write.txt'];
const exists = (kernel: TestKernel, file: string): boolean => existsSync(path.join(kernel.homeFolder, file));

async function answerAll(kernel: TestKernel, sessionId: string, confirmed: boolean): Promise<void> {
  const { turn } = await turnState(kernel, sessionId);
  for (const item of turn?.pending ?? []) await kernel.exec('kvcoder.question.answer', { questionId: String(item.questionId), answer: { confirmed } });
  await kernel.clock.advance(0);
}

describe('approval of the calls that can ask (08 §8.3, ADR 0011, 7)', { timeout: 30_000 }, () => {
  it('QA18-H11 risky false runs at once; risky true asks, holds the call, and runs it once allowed', async () => {
    const seed = (folder: string): void => looked.write(folder, 'seed.txt', 'old');
    const safe = await looked(seed, asking({ risky: false }), settings('auto'));
    expect((await turnState(safe.kernel, safe.sessionId)).turn).toMatchObject({ outcome: 'done' });
    expect(made.map((file) => exists(safe.kernel, file))).toEqual([true, true, true]);
    for (const risky of [{ risky: true }]) {
      const waiting = await looked(seed, asking(risky), settings('auto'));
      const { turn } = await turnState(waiting.kernel, waiting.sessionId);
      expect(turn?.pending.map((item) => item.kind)).toEqual(['approval', 'approval', 'approval', 'approval']);
      expect(turn?.pending[2]?.question).toEqual({ description: 'A test call.', connector: 'fs', command: 'write', payload: { path: 'write.txt', content: 'x', ...risky } });
      expect(made.map((file) => exists(waiting.kernel, file))).toEqual([false, false, false]);
      await answerAll(waiting.kernel, waiting.sessionId, true);
      expect(made.map((file) => exists(waiting.kernel, file))).toEqual([true, true, true]);
      const results = toolResults(waiting.fake);
      expect(results.slice(0, 2)).toEqual(['[exit code 0]', '[exit code 0]']);
      expect(results[2]).toContain('"created":true');
      expect(results[3]).toContain('"replacements":1');
    }
  });

  it('QA19-E16 a call that leaves risky out is refused before anyone is asked', async () => {
    const { kernel, sessionId, results } = await looked((folder) => looked.write(folder, 'seed.txt', 'old'), asking({}), settings('auto'));
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', pending: [] });
    expect(results).toHaveLength(4);
    for (const result of results) expect(result).toMatch(/^error VALIDATION_FAILED: risky: Invalid input: expected boolean, received undefined\. The payload of \S+ \S+ is\n\{ .*risky \}$/);
    expect(made.map((file) => exists(kernel, file))).toEqual([false, false, false]);
  });

  it('QA18-E13 a denied call returns denied by the user and runs nothing', async () => {
    const { kernel, fake, sessionId } = await looked(prepare, asking({ risky: false }).slice(0, 1), settings('ask'));
    await answerAll(kernel, sessionId, false);
    expect(toolResults(fake)).toEqual(['denied by the user']);
    expect(exists(kernel, 'shell.txt')).toBe(false);
  });

  it('QA18-E14 help never asks, even when every call asks', async () => {
    const { kernel, sessionId, results } = await looked(prepare, [command('shell', 'help'), command('fs', 'help'), command('node', 'help', { command: 'exec' })], settings('ask'));
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', pending: [] });
    expect(results.map((result) => result.split(/[: ]/)[0])).toEqual(['shell', 'fs', 'node']);
  });
});
