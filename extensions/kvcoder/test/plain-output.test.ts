import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { runs, says, shell, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

// The commands here are bash, the Linux and macOS branch.
describe('plain command output (KVC-42, ADR 0051)', { timeout: 30_000 }, () => {
  it('M2.4-E152 a shell call sees NO_COLOR=1 and returns its output without colour codes', async () => {
    if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell("printf '\\033[31mred\\033[0m plain'"), shell('echo "color:${NO_COLOR:-unset}"')), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const expected = process.env['NO_COLOR'] ?? (process.env['FORCE_COLOR'] === undefined ? '1' : 'unset');
    expect(toolResults(fake)).toEqual(['red plain\n[exit code 0]', `color:${expected}\n[exit code 0]`]);
  });
});
