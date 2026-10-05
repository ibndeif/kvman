import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { alive } from './support/alive.ts';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { runs, says, shell, toolResults } from './support/model-script.ts';
import { fileExists, newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

// The commands here are bash, the Linux and macOS branch; the Windows branch's lookup, arguments, and tree kill are
// covered in unit/shell-command.test.ts.
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
}

describe('the real shell (08 §8.3)', { timeout: 30_000 }, () => {
  it('M2.4-E25 calls run in the workspace folder, cd does not carry over, stdin is empty, output is combined, and the exit code is reported', async () => {
    posixShell();
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell('cd /'), shell('pwd')), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    fake.reply(runs(shell('read line; echo "read:$?"'), shell('echo out; echo err >&2; exit 3')), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'again' });
    await kernel.clock.advance(0);
    const results = toolResults(fake);
    expect(results.slice(0, 2)).toEqual(['[exit code 0]', `${kernel.homeFolder}\n[exit code 0]`]);
    expect(results[2]).toBe('read:1\n[exit code 0]');
    expect(results[3]).toMatch(/^(out\nerr|err\nout)\n\[exit code 3\]$/);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.at(-2)?.content['details']).toMatchObject({ description: 'A test call.', connector: 'shell', command: 'exec', output: expect.stringContaining('out') as unknown, exitCode: 3, durationMs: expect.any(Number) as unknown });
  });

  it('M2.4-E26 a call past its timeout is killed with its process group and reports the timeout', async () => {
    posixShell();
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell('sleep 30 & echo $! > bg.pid; echo started; sleep 30', { timeoutMs: 1_000 })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['started\n[timed out after 1 s; the process tree was killed]\n[exit code 124]']);
    const pid = Number(readFileSync(path.join(kernel.homeFolder, 'bg.pid'), 'utf8'));
    await vi.waitFor(() => expect(alive(pid)).toBe(false), wait);
  });

  it("M2.4-E27 cancelling a turn kills a running shell call's process tree", async () => {
    posixShell();
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell('sleep 30 & echo $! > bg.pid; wait')));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    const pidFile = path.join(kernel.homeFolder, 'bg.pid');
    await vi.waitFor(() => expect(fileExists(pidFile) && readFileSync(pidFile, 'utf8').trim() !== '').toBe(true), wait);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    await kernel.clock.advance(0);
    await vi.waitFor(() => expect(alive(pid)).toBe(false), wait);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'cancelled' });
  });

  it("M2.4-E30 tool arguments that don't fit return an error result naming the problems", async () => {
    posixShell();
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: { id: 'a', name: 'run', arguments: { description: 'No command.', connector: 'shell' } } }, { toolCall: { id: 'b', name: 'python', arguments: { command: 'ls' } } }] }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [missing, wrong] = toolResults(fake);
    expect(missing).toMatch(/^error VALIDATION_FAILED: The call's arguments are invalid: command: .* \(it must be one of the connector's commands, or help\)\. Call run again with the arguments fixed\.$/);
    expect(wrong).toBe("error VALIDATION_FAILED: The call's arguments are invalid: the tool is run, not python.");
  });
});
