import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// A local stand-in for pi.dev's catalog (ADR 0110): `GET /api/models/providers/<provider>` answers what a test set for
// that provider, and 404 otherwise. It records each request's provider and headers.

export type CatalogAnswer = { status: number; body?: unknown; lastModified?: string; etag?: string };

export type CatalogRequest = { provider: string; types: string | null; ifNoneMatch: string | undefined; userAgent: string | undefined; authorization: string | undefined };

export type FakeCatalog = {
  url: string;
  answer(provider: string, answer: CatalogAnswer): void;
  requests(): CatalogRequest[];
  close(): Promise<void>;
};

/** A date after pi-ai 1.4.0's built-in data (2026-10-21), and one before it. */
export const newer = 'Fri, 30 Oct 2026 13:37:30 GMT';
export const older = 'Tue, 20 Oct 2026 00:00:00 GMT';

/** The API and address the built-in models of groq and openrouter are called at; openai's is `liveModel`'s default. */
export const groqRoute = { api: 'openai-completions', baseUrl: 'https://api.groq.com/openai/v1' };
export const openrouterRoute = { api: 'openai-completions', baseUrl: 'https://openrouter.ai/api/v1' };

/** A live chat model of `provider`, with every field kvai reads. */
export function liveModel(provider: string, id: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  const cost = { input: 1, output: 5, cacheRead: 0.05, cacheWrite: 1.25 };
  return { id, name: `Live ${id}`, api: 'openai-responses', provider, baseUrl: 'https://api.openai.com/v1', reasoning: true, input: ['text', 'image'], cost, contextWindow: 272_000, maxTokens: 128_000, type: 'chat', ...fields };
}

function respond(response: ServerResponse, answer: CatalogAnswer | undefined): void {
  if (answer === undefined) {
    response.writeHead(404).end();
    return;
  }
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (answer.lastModified !== undefined) headers['last-modified'] = answer.lastModified;
  if (answer.etag !== undefined) headers.etag = answer.etag;
  response.writeHead(answer.status, headers).end(answer.body === undefined ? undefined : JSON.stringify(answer.body));
}

export async function startFakeCatalog(): Promise<FakeCatalog> {
  const answers = new Map<string, CatalogAnswer>();
  const seen: CatalogRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const provider = decodeURIComponent(url.pathname.replace('/api/models/providers/', ''));
    const header = (name: string) => (typeof request.headers[name] === 'string' ? request.headers[name] : undefined);
    seen.push({ provider, types: url.searchParams.get('types'), ifNoneMatch: header('if-none-match'), userAgent: header('user-agent'), authorization: header('authorization') });
    respond(response, request.method === 'GET' && url.pathname.startsWith('/api/models/providers/') ? answers.get(provider) : undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    answer: (provider, answer) => answers.set(provider, answer),
    requests: () => [...seen],
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
