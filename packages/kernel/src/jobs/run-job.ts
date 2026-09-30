import { ProblemError, type Caller, type Problem, type Workspace, type z } from '@kvman/sdk';
import type { KernelLogger } from '../logging/logger.ts';
import { kernelProblem } from '../problems.ts';
import type { SyncEnd } from '../workers/protocol.ts';
import { runInJob, type JobKind, type RunningJob } from './current-job.ts';
import type { Registration, Registry, StartedJob } from './registry.ts';

// Runs one job on this worker (plan 02 §2.1–§2.3, §2.13, §2.15): access, depth, size caps, input and output
// validation, the timeout, and turning any failure into a Problem.

export const maximumDepth = 16;

export type JobEnvironment = { registry: Registry; logger: KernelLogger; reportSyncEnd: (end: SyncEnd) => void };

export type JobRequest = {
  id: string;
  rootId: string;
  name: string;
  input: unknown;
  workspace: Workspace;
  caller: Caller;
  parent: RunningJob | undefined;
  signal: AbortSignal;
  fromHandler: boolean;
  handlerExtension: string | undefined;
};

// What a job runs: a registered command or query, or an extension's handler for a kernel point.
type Runnable = { kind: JobKind; name: string; owner: string; timeoutMs: number; start: (input: unknown) => StartedJob; registration: Registration | undefined };

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? '');
}

function runnableOf(registry: Registry, request: JobRequest): Runnable {
  if (request.handlerExtension !== undefined) {
    const handler = registry.handlers.find((entry) => entry.point === request.name && entry.owner === request.handlerExtension);
    if (handler === undefined) throw kernelProblem('NOT_FOUND', `${request.handlerExtension} has no handler for ${request.name}.`, { name: request.name });
    return { kind: 'command', name: handler.point, owner: handler.owner, timeoutMs: handler.timeoutMs, start: handler.start, registration: undefined };
  }
  const registration = registry.jobs.get(request.name);
  if (registration === undefined) throw kernelProblem('NOT_FOUND', `There is no command or query ${request.name}.`, { name: request.name });
  return { ...registration, registration };
}

function checkAccess(registration: Registration, request: JobRequest): void {
  const caller = request.caller;
  const own = caller.kind === 'extension' && caller.name === registration.owner;
  if (!registration.public && caller.kind !== 'kernel' && !own) {
    throw kernelProblem('NOT_PUBLIC', `${registration.name} is private to ${registration.owner}.`, { name: registration.name });
  }
  if (request.parent?.kind === 'query' && registration.kind === 'command') {
    throw kernelProblem('READ_ONLY', `The query ${request.parent.name} can't run the command ${registration.name}.`, { name: registration.name });
  }
  if ((request.parent?.depth ?? 0) + 1 > maximumDepth) {
    throw kernelProblem('TOO_DEEP', `Sync calls are nested deeper than ${maximumDepth}.`, { limit: maximumDepth });
  }
}

function checkSize(registration: Registration, value: unknown, part: 'input' | 'output'): void {
  const limit = part === 'input' ? registration.maxInputBytes : registration.maxOutputBytes;
  if (jsonBytes(value) > limit) throw kernelProblem('TOO_LARGE', `The ${part} of ${registration.name} is over ${limit} bytes of JSON.`, { limit });
}

function invalid(name: string, part: 'input' | 'output', error: z.ZodError): Error {
  const issues = error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
  return kernelProblem('VALIDATION_FAILED', `The ${part} of ${name} is invalid.`, { issues });
}

function checkedOutput(registration: Registration | undefined, output: unknown): unknown {
  if (registration === undefined) return null;
  checkSize(registration, output, 'output');
  const parsed = registration.output.safeParse(output);
  if (!parsed.success) throw invalid(registration.name, 'output', parsed.error);
  return parsed.data;
}

async function withTimeout(runnable: Runnable, controller: AbortController, run: () => Promise<unknown>): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const problem = kernelProblem('TIMEOUT', `${runnable.name} ran past ${runnable.timeoutMs} ms.`, { limit: runnable.timeoutMs });
      controller.abort(problem);
      reject(problem);
    }, runnable.timeoutMs);
  });
  try {
    return await Promise.race([run(), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

function problemOf(error: unknown, name: string, logger: KernelLogger, jobId: string): Problem {
  if (error instanceof ProblemError) return error.problem;
  const failure = error instanceof Error ? error : new Error(String(error));
  logger.error('A handler failed with an error that is not a Problem.', { name, jobId, error: failure.message, stack: failure.stack ?? '' });
  return { code: 'HANDLER_FAILED', message: `The handler of ${name} failed.` };
}

async function runChecked(registry: Registry, request: JobRequest): Promise<unknown> {
  const runnable = runnableOf(registry, request);
  if (runnable.registration !== undefined) {
    checkAccess(runnable.registration, request);
    checkSize(runnable.registration, request.input, 'input');
  }
  const started = runnable.start(request.input);
  if ('error' in started) throw invalid(runnable.name, 'input', started.error);
  const controller = new AbortController();
  const job: RunningJob = {
    id: request.id,
    rootId: request.rootId,
    name: runnable.name,
    kind: runnable.kind,
    owner: runnable.owner,
    workspace: request.workspace,
    caller: request.caller,
    signal: AbortSignal.any([request.signal, controller.signal]),
    depth: (request.parent?.depth ?? 0) + 1,
    fromHandler: request.fromHandler,
  };
  const output = await withTimeout(runnable, controller, () => runInJob(job, async () => started.run()));
  return checkedOutput(runnable.registration, output);
}

export function syncEndOf(request: JobRequest, problem: Problem, reason: string): SyncEnd {
  const base = { jobId: request.id, rootId: request.rootId, name: request.name, caller: request.caller, workspaceId: request.workspace.id };
  return problem.code === 'CANCELLED'
    ? { point: 'kernel.job.cancelled', input: { ...base, reason }, workspaceId: request.workspace.id }
    : { point: 'kernel.job.failed', input: { ...base, problem, attempts: 1 }, workspaceId: request.workspace.id };
}

// Any failure leaves as a ProblemError, so a nested caller and the worker see only Problems. A nested sync job that
// fails is reported for the kernel's handler points here; the root job's end is reported by whoever runs the root.
export async function runJob(environment: JobEnvironment, request: JobRequest): Promise<unknown> {
  try {
    return await runChecked(environment.registry, request);
  } catch (error) {
    const problem = problemOf(error, request.name, environment.logger, request.id);
    if (request.parent !== undefined && !request.fromHandler) environment.reportSyncEnd(syncEndOf(request, problem, 'cancel'));
    throw error instanceof ProblemError ? error : new ProblemError(problem);
  }
}
