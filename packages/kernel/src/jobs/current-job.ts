import { AsyncLocalStorage } from 'node:async_hooks';
import type { Caller, Workspace } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';

// The job a handler is running, tracked per async context (plan 02 §2.2).

export type JobKind = 'command' | 'query';

export type RunningJob = {
  id: string;
  rootId: string;
  name: string;
  kind: JobKind;
  owner: string;
  workspace: Workspace;
  caller: Caller;
  signal: AbortSignal;
  depth: number;
};

const storage = new AsyncLocalStorage<RunningJob>();

export function runInJob<Result>(job: RunningJob, run: () => Result): Result {
  return storage.run(job, run);
}

export function currentJob(): RunningJob | undefined {
  return storage.getStore();
}

export function requireJob(call: string): RunningJob {
  const job = storage.getStore();
  if (job === undefined) throw kernelProblem('NO_JOB', `${call} works only inside a handler.`, { call });
  return job;
}

export function requireWritable(job: RunningJob, call: string): void {
  if (job.kind === 'query') throw kernelProblem('READ_ONLY', `${call} can't run inside the query ${job.name}.`, { call, name: job.name });
}
