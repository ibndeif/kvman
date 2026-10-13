import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fsCall, runs, says, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const numbered = (from: number, to: number, word = 'line'): string => Array.from({ length: to - from + 1 }, (_line, index) => `${word} ${from + index}\n`).join('');

describe('what an edit returns of a long change (08 §8.5, ADR 0069, 2)', { timeout: 30_000 }, () => {
  it('M2.4-E245 a long change shows its two ends around a count, and a short one shows all of it', async () => {
    const { kernel, fake } = await kvcoder.start();
    writeFileSync(path.join(kernel.homeFolder, 'long.txt'), numbered(1, 60));
    const sessionId = await newSession(kernel);
    fake.reply(
      runs(fsCall('read', { path: 'long.txt' })),
      runs(fsCall('edit', { path: 'long.txt', edits: [{ oldText: numbered(11, 50), newText: numbered(11, 50, 'new') }], risky: false })),
      runs(fsCall('edit', { path: 'long.txt', edits: [{ oldText: 'line 56\n', newText: 'changed 56\n' }], risky: false })),
      says('done'),
    );
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [, long, short] = toolResults(fake).map((text) => JSON.parse(text) as { fromLine: number; firstChangedLine: number; content: string });
    expect(long).toMatchObject({ fromLine: 8, firstChangedLine: 11 });
    expect(long?.content).toBe(`${numbered(8, 10)}${numbered(11, 13, 'new')}[… 34 lines not shown …]\n${numbered(48, 50, 'new')}${numbered(51, 53)}`);
    expect(short).toMatchObject({ fromLine: 53, firstChangedLine: 56 });
    expect(short?.content).toBe(`${numbered(53, 55)}changed 56\n${numbered(57, 59)}`);
  });
});
