import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { alive } from './support/alive.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { runs, says, shell, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();
const stopped = '[background processes were stopped when the command ended; set background to true to keep one running]';

// These calls are bash, the Linux and macOS branch: Windows can't kill what a finished shell left (ADR 0009, 148).
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
}

async function runCall(line: string): Promise<{ result: string; durationMs: number; folder: string }> {
  const { kernel, fake } = await kvcoder.start();
  const sessionId = await newSession(kernel);
  fake.reply(runs(shell(line)), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  const details = messages.at(-2)?.content['details'] as { durationMs: number };
  return { result: toolResults(fake)[0] ?? '', durationMs: details.durationMs, folder: kernel.homeFolder };
}

const pidIn = (folder: string): number => Number(readFileSync(path.join(folder, 'bg.pid'), 'utf8'));

describe('a shell call and the processes it leaves behind (08 §8.3, ADR 0009, 148)', { timeout: 30_000 }, () => {
  it('QA3-H11 a call ends when its shell exits, and stops the background process it started', async () => {
    posixShell();
    const { result, durationMs, folder } = await runCall('sleep 30 & echo $! > bg.pid; echo started');
    expect(result).toBe(`started\n${stopped}\n[exit code 0]`);
    expect(durationMs).toBeLessThan(10_000);
    await vi.waitFor(() => expect(alive(pidIn(folder))).toBe(false), wait);
  });

  it('QA3-E12 a call that leaves nothing behind has no note, and a timeout shows only its own line', async () => {
    posixShell();
    expect((await runCall('echo hi')).result).toBe('hi\n[exit code 0]');
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell('sleep 30', { timeoutMs: 1_000 })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['[timed out after 1 s; the process tree was killed]\n[exit code 124]']);
  });

  it('QA3-E13 output written before the shell exits is kept, with its exit code', async () => {
    posixShell();
    const { result, folder } = await runCall('sleep 30 & echo $! > bg.pid; echo before; exit 3');
    expect(result).toBe(`before\n${stopped}\n[exit code 3]`);
    await vi.waitFor(() => expect(alive(pidIn(folder))).toBe(false), wait);
  });

  it("QA3-E14 a process outside the shell's group can't hold the call", async () => {
    posixShell();
    const { result, durationMs, folder } = await runCall(`setsid sleep 30 & echo $! > bg.pid; until [ "$(ps -o pgid= -p $! | tr -d ' ')" != "$(ps -o pgid= -p $$ | tr -d ' ')" ]; do sleep 0.01; done; echo up`);
    try {
      expect(result).toBe('up\n[exit code 0]');
      expect(durationMs).toBeLessThan(10_000);
    } finally {
      process.kill(pidIn(folder), 'SIGKILL');
    }
  });
});
