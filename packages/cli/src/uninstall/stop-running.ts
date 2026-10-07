import type { RunProgram } from './run-program.ts';

// Stopping the kvman that runs on the home (ADR 0031, 7): SIGTERM on Linux and macOS, which runs the stop sequence
// (plan 02 §2.14); `taskkill` on Windows, where no signal reaches another process. Then it waits until the process is
// gone, at most 15 seconds.

const stopLimit = 15_000;
const checkEvery = 250;

export type StopServices = {
  platform: NodeJS.Platform;
  runProgram: RunProgram;
  isAlive(pid: number): boolean;
  sendStop(pid: number): void;
  wait(milliseconds: number): Promise<void>;
};

/** Whether the process is gone. */
export async function stopRunning(pid: number, services: StopServices): Promise<boolean> {
  if (services.platform === 'win32') await services.runProgram('taskkill', ['/PID', String(pid), '/T', '/F'], 'captured');
  else services.sendStop(pid);
  for (let waited = 0; waited < stopLimit; waited += checkEvery) {
    if (!services.isAlive(pid)) return true;
    await services.wait(checkEvery);
  }
  return !services.isAlive(pid);
}

/** SIGTERM to a process that may already be gone. */
export function sendStopSignal(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
  }
}
