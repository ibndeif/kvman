import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { runs, says, shell, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('a call with very large arguments (08 §8.2, ADR 0009, 189)', { timeout: 30_000 }, () => {
  it('QA8-H10 a call over 64 KiB runs, since its stream chunk no longer carries the whole command', async () => {
    if (process.platform === 'win32') throw new Error('This call is bash; Windows runs PowerShell.');
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell(`echo ${'x'.repeat(70_000)}`)), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 2 });
    expect(toolResults(fake)[0]).toMatch(/^x{100}/);
    expect(toolResults(fake)[0]).toContain('bytes omitted');
  });
});
