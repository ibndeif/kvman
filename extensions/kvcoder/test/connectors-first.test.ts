import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { runs, says, shell, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('connectors first is advice, not enforcement (08 §8.2, ADR 0009, 171)', { timeout: 30_000 }, () => {
  it('QA5-E6 a shell call that writes a file by redirection still runs under auto, and the file is there', async () => {
    if (process.platform === 'win32') throw new Error('This call is bash; Windows runs PowerShell.');
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.shell.approval': 'auto' } });
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell('printf hi > plain.txt')), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(readFileSync(path.join(kernel.homeFolder, 'plain.txt'), 'utf8')).toBe('hi');
    expect(toolResults(fake)).toEqual(['[exit code 0]']);
  });
});
