import { ProblemError, type Problem } from '@kvman/sdk';
import { runJob, syncEndOf, type JobEnvironment, type JobRequest } from '../jobs/run-job.ts';
import { kernelProblem } from '../problems.ts';
import type { AbortReason, RootJob, ToMain, ToWorker } from './protocol.ts';

// Root jobs on a worker: each gets an abort controller that the main thread can pull for a cancel or a shutdown. A
// cancelled job ends CANCELLED once its handler settles; a job cut off by shutdown that then fails ends INTERRUPTED.

type Root = { controller: AbortController; reason: AbortReason | undefined };

function abortProblem(reason: AbortReason): ProblemError {
  return reason === 'cancel' ? kernelProblem('CANCELLED', 'The job was cancelled.') : kernelProblem('INTERRUPTED', 'kvman stopped during the attempt.');
}

function problemAfter(root: Root, problem: Problem | undefined): Problem | undefined {
  if (root.reason === 'cancel') return abortProblem('cancel').problem;
  if (root.reason === 'shutdown' && problem !== undefined) return abortProblem('shutdown').problem;
  return problem;
}

export function createRootRunner(environment: JobEnvironment, send: (message: ToMain) => void) {
  const roots = new Map<number, Root>();
  const runRoot = async (requestId: number, job: RootJob): Promise<void> => {
    const root: Root = { controller: new AbortController(), reason: undefined };
    roots.set(requestId, root);
    const request: JobRequest = { ...job, rootId: job.id, parent: undefined, signal: root.controller.signal, handlerExtension: job.handlerExtension };
    let output: unknown;
    let failure: Problem | undefined;
    try {
      output = await runJob(environment, request);
    } catch (error) {
      if (!(error instanceof ProblemError)) throw error;
      failure = error.problem;
    } finally {
      roots.delete(requestId);
    }
    const problem = problemAfter(root, failure);
    if (problem === undefined) {
      send({ kind: 'result', requestId, output });
      return;
    }
    if (!job.async && !job.fromHandler) environment.reportSyncEnd(syncEndOf(request, problem, 'cancel'));
    send({ kind: 'problem', requestId, problem });
  };
  return {
    run: (requestId: number, job: RootJob): void => {
      void runRoot(requestId, job);
    },
    abort: (requestId: number, reason: AbortReason): void => {
      const root = roots.get(requestId);
      if (root === undefined || root.reason !== undefined) return;
      root.reason = reason;
      root.controller.abort(abortProblem(reason));
    },
  };
}

type Answers = Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>;

export function answerFromMain(answers: Answers, message: Extract<ToWorker, { kind: 'answer' }>): void {
  const pending = answers.get(message.requestId);
  answers.delete(message.requestId);
  if (message.problem === undefined) pending?.resolve(message.value);
  else pending?.reject(new ProblemError(message.problem));
}
