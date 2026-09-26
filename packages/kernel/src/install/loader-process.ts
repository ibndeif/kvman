import { fork } from 'node:child_process';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loaderResultSchema, type Json, type LoaderRequest } from '@kvman/protocol';
import { ProblemError } from '../problems.ts';
import type { SchedulerTimers } from '../scheduler/timers.ts';
import { InstallFailure } from './install-failure.ts';
import { kernelReadRoots } from './kernel-packages.ts';

// 03 §3.5, 06 §6.2 step 4: setup gets 10 s in the loader.
export const loaderDeadlineMs = 10_000;

export interface InstallLoader {
  record(request: LoaderRequest, tree: string): Promise<Json>;
}

// The loader entry is the sibling module of this one in the same build, like the host worker's.
function loaderEntry(): { file: string; execArgv: string[] } {
  const extension = extname(fileURLToPath(import.meta.url));
  const file = fileURLToPath(new URL(`./loader-main${extension}`, import.meta.url));
  return { file, execArgv: extension === '.ts' ? ['--conditions=@kvman/source'] : [] };
}

function setupTimedOut(): InstallFailure {
  return new InstallFailure('EXT_MANIFEST_INVALID', { detail: `setup did not finish within ${loaderDeadlineMs / 1000} s`, hint: 'setup only registers; move work into handlers' });
}

// One sandboxed loader process per staged package (03 §3.5): `--permission` with read access to the tree and the
// kernel's packages only, no child processes, workers, or addons, `--no-experimental-sqlite`, and an empty
// environment. Its one message is validated; exiting without one, or outliving the deadline, fails the stage.
export class ForkedLoader implements InstallLoader {
  readonly #timers: SchedulerTimers;
  readonly #readRoots: readonly string[];

  constructor(timers: SchedulerTimers, readRoots: readonly string[] = kernelReadRoots()) {
    this.#timers = timers;
    this.#readRoots = readRoots;
  }

  record(request: LoaderRequest, tree: string): Promise<Json> {
    const { file, execArgv } = loaderEntry();
    const permissions = ['--permission', ...[tree, ...this.#readRoots].map((root) => `--allow-fs-read=${root}`), '--no-experimental-sqlite'];
    const child = fork(file, [], { execArgv: [...execArgv, ...permissions], serialization: 'json', stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: {} });
    let stderr = '';
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-4096); });
    return new Promise((done, fail) => {
      let settled = false;
      const settle = (outcome: () => void): void => {
        if (settled) return;
        settled = true;
        deadline.cancel();
        if (child.exitCode === null) child.kill('SIGKILL');
        outcome();
      };
      const deadline = this.#timers.set(loaderDeadlineMs, () => settle(() => fail(setupTimedOut())));
      child.once('message', (value: unknown) => {
        const parsed = loaderResultSchema.safeParse(value);
        if (!parsed.success) {
          settle(() => fail(new InstallFailure('EXT_MANIFEST_INVALID', { detail: 'the loader sent an invalid result' })));
          return;
        }
        const result = parsed.data;
        settle(() => (result.ok ? done(result.manifest) : fail(new ProblemError(result.problem))));
      });
      child.once('exit', () => settle(() => fail(new InstallFailure('EXT_MANIFEST_INVALID', { detail: `the loader exited before setup was recorded${stderr === '' ? '' : `: ${stderr.trim().split('\n').at(-1) ?? ''}`}` }))));
      child.send(request);
    });
  }
}
