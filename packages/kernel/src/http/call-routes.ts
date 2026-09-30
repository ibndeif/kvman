import type { Hono } from 'hono';
import { ProblemError } from '@kvman/sdk';
import type { Kernel } from '../kernel.ts';
import { kernelProblem } from '../problems.ts';
import { homeWorkspaceId } from '../workspaces/workspaces.ts';
import { answer, failure, problemOf } from './envelope.ts';
import { parseCallBody, readCapped, type CallBody } from './request-body.ts';

// `POST /api/commands/:name` and `POST /api/queries/:name` (plan 04 §4.1, ADR 0009, 40): public names only, as the
// user. A sync call answers with its output and job id, and is cancelled when its client leaves.

const user = { kind: 'user' } as const;

// A client that leaves cancels its sync call; a call that has just ended has nothing left to cancel.
function cancelOnLeave(kernel: Kernel, request: Request, jobId: string): () => void {
  const leave = (): void => {
    try {
      kernel.cancel(jobId);
    } catch (error) {
      if (!(error instanceof ProblemError && error.problem.code === 'NOT_FOUND')) throw error;
    }
  };
  request.signal.addEventListener('abort', leave, { once: true });
  return () => request.signal.removeEventListener('abort', leave);
}

async function run(kernel: Kernel, request: Request, name: string, call: CallBody): Promise<Response> {
  const options = { caller: user, workspaceId: call.workspaceId ?? homeWorkspaceId };
  try {
    kernel.web.workspace(options.workspaceId);
  } catch (error) {
    return failure(problemOf(error));
  }
  if (call.async) {
    try {
      const jobId = await kernel.execAsync(name, call.input, options);
      kernel.web.logger.debug('An HTTP call queued a job.', { name, jobId });
      return answer({ jobId });
    } catch (error) {
      return failure(problemOf(error));
    }
  }
  const jobId = kernel.web.newJobId();
  const stopWatching = cancelOnLeave(kernel, request, jobId);
  try {
    const output = kernel.exec(name, call.input, { ...options, jobId });
    kernel.web.logger.debug('An HTTP call started a job.', { name, jobId });
    return answer({ output: await output, jobId });
  } catch (error) {
    return failure(problemOf(error), { jobId });
  } finally {
    stopWatching();
  }
}

async function handle(kernel: Kernel, request: Request, name: string, kind: 'command' | 'query'): Promise<Response> {
  const target = kernel.web.target(name);
  if (target === undefined || target.kind !== kind) return failure(kernelProblem('NOT_FOUND', `There is no ${kind} ${name}.`, { name }).problem);
  if (!target.public) return failure(kernelProblem('NOT_PUBLIC', `${name} is private to its extension.`, { name }).problem);
  const body = parseCallBody(await readCapped(request, target.maxInputBytes), kind);
  if (body.kind === 'not-json') return failure(kernelProblem('VALIDATION_FAILED', 'The request body is not JSON.').problem, { status: 400 });
  if (body.kind === 'invalid') return failure(body.problem);
  return run(kernel, request, name, body.call);
}

export function registerCallRoutes(app: Hono, kernel: Kernel): void {
  app.post('/api/commands/:name', (c) => handle(kernel, c.req.raw, c.req.param('name'), 'command'));
  app.post('/api/queries/:name', (c) => handle(kernel, c.req.raw, c.req.param('name'), 'query'));
}
