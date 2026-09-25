import { randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import { problemSchema } from '@kvman/protocol';
import { findKernel, postCommand, readLock } from './kernel-client.ts';
import { printLine, printProblem } from './output.ts';

const notRunning = 'kvman is not running';

// ADR 0096: the /health JSON, or "not running" with exit 1.
export async function status(home: string): Promise<number> {
  const running = await findKernel(home);
  if (running === undefined) {
    printLine(notRunning);
    return 1;
  }
  printLine(JSON.stringify(running.health));
  return 0;
}

// Resolves once the lock with this nonce is gone; the watch starts before the check, so no removal is missed.
function lockReleased(home: string, nonce: string): Promise<void> {
  return new Promise((resolve) => {
    const watcher = watch(home, () => check());
    const check = (): void => {
      if (readLock(home)?.nonce === nonce) return;
      watcher.close();
      resolve();
    };
    check();
  });
}

// ADR 0090: kernel.shutdown over HTTP, then wait until the daemon has released its lock.
export async function stop(home: string): Promise<number> {
  const running = await findKernel(home);
  if (running === undefined) {
    printLine(notRunning);
    return 0;
  }
  const response = await postCommand(running.lock.port, 'kernel.shutdown', {}, randomUUID());
  if (!response.ok) {
    printProblem(problemSchema.parse(await response.json()));
    return 1;
  }
  await lockReleased(home, running.lock.nonce);
  printLine('kvman stopped');
  return 0;
}
