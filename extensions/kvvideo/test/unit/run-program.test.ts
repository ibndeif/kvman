import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { runProgram } from '../../src/programs/run-program.ts';
import { useFakePrograms } from '../support/fake-programs.ts';

const programs = useFakePrograms();

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('running a program (16 §16.3)', { timeout: 20_000 }, () => {
  it('M5.1-E3 a program that does not answer in time is stopped with its tree, and counts as timed out', async () => {
    const command = programs.program('ffmpeg', `const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); console.log(String(child.pid)); setInterval(() => {}, 1000);`);
    const run = await runProgram({ name: 'ffmpeg', command }, [], { signal: new AbortController().signal, timeoutMs: 500 });
    expect(run.timedOut).toBe(true);
    const grandchild = Number(run.stdout.trim());
    await expect.poll(() => alive(grandchild), { timeout: 5_000 }).toBe(false);
  });

  it('M5.1-E3 a program that cannot be started fails kvvideo/PROGRAM_MISSING with its setting', async () => {
    const failure = await runProgram({ name: 'ffprobe', command: '/nowhere/ffprobe' }, [], { signal: new AbortController().signal }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure instanceof ProblemError ? failure.problem : failure).toMatchObject({ code: 'kvvideo/PROGRAM_MISSING', params: { program: 'ffprobe', setting: 'kvvideo.programs.ffprobe' } });
  });

  it('M5.1-E3 a cancelled job stops its program', async () => {
    const command = programs.program('piper', 'setInterval(() => {}, 1000);');
    const controller = new AbortController();
    const running = runProgram({ name: 'piper', command }, [], { signal: controller.signal });
    controller.abort();
    expect((await running).timedOut).toBe(false);
  });
});
