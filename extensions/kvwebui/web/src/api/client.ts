import { envelopeSchema, outputEnvelopeSchema, ProblemError, queuedEnvelopeSchema, z, type Json, type Problem } from '@kvman/sdk';
import type { StreamEvent } from '@kvman/sdk/web';
import { streamEvents } from './job-stream.ts';
import { offlineProblem } from './offline.ts';

// The browser's side of the HTTP API (plan 04 §4.1). Every call carries the tab's workspace (plan 06 §6.2); a failed
// call throws a ProblemError, and a failed command's error also carries its job id, so its effects can be taken. A
// kvman that doesn't answer is `kvwebui/OFFLINE`.

const catalogEnvelopeSchema = envelopeSchema({ catalog: z.record(z.string(), z.string()) });

/** A command's output and the id of its job. */
export type Ran = { output: Json; jobId: string };

/** A failed command or query: its Problem, and its job id when the job started. */
export class CallFailure extends ProblemError {
  readonly jobId: string | undefined;

  constructor(problem: Problem, jobId: string | undefined) {
    super(problem);
    this.jobId = jobId;
  }
}

export type Api = {
  query(name: string, input: unknown): Promise<Json>;
  command(name: string, input: unknown): Promise<Ran>;
  // Queues a command and resolves to its job id.
  start(name: string, input: unknown): Promise<string>;
  // The job's stream events (plan 04 §4.4); it ends after the result or Problem, or when `signal` aborts.
  stream(jobId: string, signal: AbortSignal): AsyncGenerator<StreamEvent>;
  catalog(language: string): Promise<Record<string, string>>;
};

export type ApiOptions = {
  fetch: typeof fetch;
  workspaceId: () => string;
  // Sees every failed call's Problem first, so a closed workspace can move the tab to Home.
  onProblem: (problem: Problem) => void;
};

export function createApi(options: ApiOptions): Api {
  const answer = async (url: string, init?: RequestInit): Promise<unknown> => {
    const response = await options.fetch(url, init).catch(() => undefined);
    if (response === undefined) throw new ProblemError(offlineProblem);
    return response.json();
  };
  const fail = (problem: Problem, jobId?: string): never => {
    options.onProblem(problem);
    throw new CallFailure(problem, jobId);
  };
  const post = (kind: 'commands' | 'queries', name: string, body: Record<string, unknown>): Promise<unknown> =>
    answer(`/api/${kind}/${encodeURIComponent(name)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, workspaceId: options.workspaceId() }) });
  const call = async (kind: 'commands' | 'queries', name: string, input: unknown): Promise<Ran> => {
    const envelope = outputEnvelopeSchema.parse(await post(kind, name, { input }));
    return envelope.ok ? { output: envelope.output, jobId: envelope.jobId } : fail(envelope.problem, envelope.jobId);
  };
  return {
    query: async (name, input) => (await call('queries', name, input)).output,
    command: (name, input) => call('commands', name, input),
    start: async (name, input) => {
      const envelope = queuedEnvelopeSchema.parse(await post('commands', name, { input, async: true }));
      return envelope.ok ? envelope.jobId : fail(envelope.problem, envelope.jobId);
    },
    stream: (jobId, signal) => streamEvents(options.fetch, jobId, signal),
    catalog: async (language) => {
      const envelope = catalogEnvelopeSchema.parse(await answer(`/api/locales/${encodeURIComponent(language)}`));
      return envelope.ok ? envelope.catalog : fail(envelope.problem);
    },
  };
}

// The Problem of anything a call threw.
export function problemOf(error: unknown): Problem {
  if (error instanceof ProblemError) return error.problem;
  throw error;
}

// The job id a failed call carries, if its job started.
export function failedJobId(error: unknown): string | undefined {
  return error instanceof CallFailure ? error.jobId : undefined;
}
