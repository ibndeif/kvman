import { envelopeSchema, outputEnvelopeSchema, ProblemError, z, type Json, type Problem } from '@kvman/sdk';

// The browser's side of the HTTP API (plan 04 §4.1). Every call carries the tab's workspace (plan 06 §6.2); a failed
// call throws a ProblemError. A kvman that doesn't answer is `kvwebui/OFFLINE`.

const catalogEnvelopeSchema = envelopeSchema({ catalog: z.record(z.string(), z.string()) });

export type Api = {
  query(name: string, input: unknown): Promise<Json>;
  command(name: string, input: unknown): Promise<Json>;
  catalog(language: string): Promise<Record<string, string>>;
};

export type ApiOptions = {
  fetch: typeof fetch;
  workspaceId: () => string;
  // Sees every failed call's Problem first, so a closed workspace can move the tab to Home.
  onProblem: (problem: Problem) => void;
};

export const offlineProblem: Problem = { code: 'kvwebui/OFFLINE', message: "kvman didn't answer." };

export function createApi(options: ApiOptions): Api {
  const answer = async (url: string, init?: RequestInit): Promise<unknown> => {
    const response = await options.fetch(url, init).catch(() => undefined);
    if (response === undefined) throw new ProblemError(offlineProblem);
    return response.json();
  };
  const fail = (problem: Problem): never => {
    options.onProblem(problem);
    throw new ProblemError(problem);
  };
  const call = async (kind: 'commands' | 'queries', name: string, input: unknown): Promise<Json> => {
    const body = JSON.stringify({ input, workspaceId: options.workspaceId() });
    const envelope = outputEnvelopeSchema.parse(await answer(`/api/${kind}/${encodeURIComponent(name)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }));
    return envelope.ok ? envelope.output : fail(envelope.problem);
  };
  return {
    query: (name, input) => call('queries', name, input),
    command: (name, input) => call('commands', name, input),
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
