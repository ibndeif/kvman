import { request as httpRequest } from 'node:http';
import { vi } from 'vitest';
import { z } from '@kvman/sdk';

// Calls to a kvman child's HTTP API (plan 04). `raw` sends a request with exactly the given headers, which `fetch`
// would normalize (the Host header, `..` in paths).

export type Api = {
  command(name: string, input: unknown, extra?: Record<string, unknown>): Promise<unknown>;
  query(name: string, input: unknown, extra?: Record<string, unknown>): Promise<unknown>;
  fetch(route: string, init?: RequestInit): Promise<Response>;
  raw(route: string, headers: Record<string, string>): Promise<{ status: number; body: string }>;
  // Waits until a query's output passes `check`.
  until(name: string, input: unknown, check: (output: unknown) => boolean): Promise<void>;
};

const outputSchema = z.object({ ok: z.literal(true), output: z.unknown() });

export const childWait = { timeout: 20_000, interval: 50 };

export function api(port: number): Api {
  const base = `http://127.0.0.1:${String(port)}`;
  const post = async (route: string, body: unknown): Promise<unknown> => {
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return response.json();
  };
  const self: Api = {
    command: (name, input, extra = {}) => post(`/api/commands/${name}`, { input, ...extra }),
    query: (name, input, extra = {}) => post(`/api/queries/${name}`, { input, ...extra }),
    fetch: (route, init) => fetch(`${base}${route}`, init),
    raw: (route, headers) =>
      new Promise((resolve, reject) => {
        const sent = httpRequest({ host: '127.0.0.1', port, path: route, method: 'GET', headers, setHost: false }, (response) => {
          let body = '';
          response.setEncoding('utf8').on('data', (text: string) => (body += text));
          response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
        });
        sent.on('error', reject);
        sent.end();
      }),
    until: async (name, input, check) => {
      await vi.waitFor(async () => {
        const answer = outputSchema.parse(await self.query(name, input));
        if (!check(answer.output)) throw new Error(`${name} answered ${JSON.stringify(answer.output)}`);
      }, childWait);
    },
  };
  return self;
}

const jobAnswerSchema = z.object({ ok: z.literal(true), job: z.object({ status: z.string(), attempts: z.number(), problem: z.object({ code: z.string() }).optional() }) });

export type JobState = z.infer<typeof jobAnswerSchema>['job'];

// A job's row through `GET /api/jobs/:id`, which the main thread answers even when every worker slot is busy.
export async function jobOf(port: number, jobId: string): Promise<JobState> {
  return jobAnswerSchema.parse(await (await fetch(`http://127.0.0.1:${String(port)}/api/jobs/${jobId}`)).json()).job;
}

// Waits until a job's row passes `check`.
export async function untilJob(port: number, jobId: string, check: (job: JobState) => boolean): Promise<JobState> {
  return vi.waitFor(async () => {
    const job = await jobOf(port, jobId);
    if (!check(job)) throw new Error(`the job is ${JSON.stringify(job)}`);
    return job;
  }, childWait);
}

const queuedSchema = z.object({ ok: z.literal(true), jobId: z.string() });

// Queues an async command and returns its job id.
export async function queue(port: number, name: string, input: unknown): Promise<string> {
  return queuedSchema.parse(await api(port).command(name, input, { async: true })).jobId;
}

// The output of a successful call.
export function outputOf(answer: unknown): unknown {
  return outputSchema.parse(answer).output;
}
