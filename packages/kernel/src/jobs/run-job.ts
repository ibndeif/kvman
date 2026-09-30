import { ProblemError, type Caller, type Problem, type Workspace, type z } from '@kvman/sdk';
import type { KernelLogger } from '../logging/logger.ts';
import { kernelProblem } from '../problems.ts';
import { runInJob, type RunningJob } from './current-job.ts';
import type { Registration, Registry } from './registry.ts';

// Runs one sync job on this worker (plan 02 §2.1–§2.3, §2.13): access, depth, size caps, input and output
// validation, the timeout, and turning any failure into a Problem.

export const maximumDepth = 16;

export type JobRequest = {
  id: string;
  rootId: string;
  name: string;
  input: unknown;
  workspace: Workspace;
  caller: Caller;
  parent: RunningJob | undefined;
  signal: AbortSignal;
};

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? '');
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
  const depth = (request.parent?.depth ?? 0) + 1;
  if (depth > maximumDepth) {
    throw kernelProblem('TOO_DEEP', `Sync calls are nested deeper than ${maximumDepth}.`, { limit: maximumDepth });
  }
}

function checkSize(registration: Registration, value: unknown, part: 'input' | 'output'): void {
  const limit = part === 'input' ? registration.maxInputBytes : registration.maxOutputBytes;
  if (jsonBytes(value) > limit) throw kernelProblem('TOO_LARGE', `The ${part} of ${registration.name} is over ${limit} bytes of JSON.`, { limit });
}

function invalid(registration: Registration, part: 'input' | 'output', error: z.ZodError): Error {
  const issues = error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message }));
  return kernelProblem('VALIDATION_FAILED', `The ${part} of ${registration.name} is invalid.`, { issues });
}

function checkedOutput(registration: Registration, output: unknown): unknown {
  checkSize(registration, output, 'output');
  const parsed = registration.output.safeParse(output);
  if (!parsed.success) throw invalid(registration, 'output', parsed.error);
  return parsed.data;
}

async function withTimeout(registration: Registration, controller: AbortController, run: () => Promise<unknown>): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const problem = kernelProblem('TIMEOUT', `${registration.name} ran past ${registration.timeoutMs} ms.`, { limit: registration.timeoutMs });
      controller.abort(problem);
      reject(problem);
    }, registration.timeoutMs);
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

// Any failure leaves as a ProblemError, so a nested caller and the worker see only Problems.
export async function runJob(registry: Registry, logger: KernelLogger, request: JobRequest): Promise<unknown> {
  try {
    return await runChecked(registry, request);
  } catch (error) {
    throw error instanceof ProblemError ? error : new ProblemError(problemOf(error, request.name, logger, request.id));
  }
}

async function runChecked(registry: Registry, request: JobRequest): Promise<unknown> {
  const registration = registry.jobs.get(request.name);
  if (registration === undefined) throw kernelProblem('NOT_FOUND', `There is no command or query ${request.name}.`, { name: request.name });
  checkAccess(registration, request);
  checkSize(registration, request.input, 'input');
  const started = registration.start(request.input);
  if ('error' in started) throw invalid(registration, 'input', started.error);
  const controller = new AbortController();
  const job: RunningJob = {
    id: request.id,
    rootId: request.rootId,
    name: registration.name,
    kind: registration.kind,
    owner: registration.owner,
    workspace: request.workspace,
    caller: request.caller,
    signal: AbortSignal.any([request.signal, controller.signal]),
    depth: (request.parent?.depth ?? 0) + 1,
  };
  const output = await withTimeout(registration, controller, () => runInJob(job, async () => started.run()));
  return checkedOutput(registration, output);
}
