import type { Ctx } from '@kvman/sdk';
import { isTransient } from '../complete/transient.ts';
import { builtinCatalog } from './builtin-catalog.ts';
import { liveModelSchema, readLiveEntries, writeLiveEntries, type LiveEntry } from './live-catalog.ts';

// One refresh of pi.dev's live lists (plan 07 §7.2, ADR 0110, 5): every built-in provider at once, with the stored
// ETag and pi's 4 s per request. A request carries no key, account, or payload. A failed provider keeps its stored
// list; the command fails for the first one once the others are saved.

const requestTimeoutMs = 4000;

type Outcome = { entry: LiveEntry } | { failed: string };

function catalogUrl(base: string, provider: string): URL {
  const url = new URL(`/api/models/providers/${encodeURIComponent(provider)}`, base);
  url.searchParams.set('types', 'chat');
  return url;
}

// A list is an array, `{ models: [...] }`, or an object of models by id, as pi reads it.
function listOf(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (typeof body !== 'object' || body === null) return [];
  const models: unknown = (body as { models?: unknown }).models;
  return Array.isArray(models) ? models : Object.values(body);
}

// Where a model is called: its wire API at its address.
export const routeOf = (model: { api: string; baseUrl: string }): string => `${model.api} ${model.baseUrl}`;

// The valid chat models of the provider that are called the way its built-in models are, with the same API at the
// same address: the installed pi-ai can call them, and the provider's key or sign-in never goes to a host the
// catalog chose.
function usableModels(body: unknown, provider: string, routes: ReadonlySet<string>): LiveEntry['models'] {
  const entries = listOf(body);
  return entries.flatMap((value) => {
    const parsed = liveModelSchema.safeParse(value);
    return parsed.success && parsed.data.provider === provider && routes.has(routeOf(parsed.data)) ? [parsed.data] : [];
  });
}

function lastModifiedOf(response: Response): number {
  const time = Date.parse(response.headers.get('last-modified') ?? '');
  return Number.isNaN(time) ? 0 : time;
}

async function fetchProvider(ctx: Ctx, base: string, provider: string, routes: ReadonlySet<string>, stored: LiveEntry | undefined): Promise<Outcome> {
  const etag = stored !== undefined && stored.url === base && stored.models.length > 0 ? stored.etag : null;
  const headers: Record<string, string> = { accept: 'application/json', 'user-agent': 'kvman', ...(etag === null ? {} : { 'if-none-match': etag }) };
  try {
    const response = await fetch(catalogUrl(base, provider), { headers, signal: AbortSignal.any([ctx.job.signal, AbortSignal.timeout(requestTimeoutMs)]) });
    if (!response.ok || response.status === 304) await response.body?.cancel();
    if (response.status === 304 && stored !== undefined) return { entry: stored };
    if (response.status === 404 || response.status === 501) return { entry: { provider, url: base, models: [], lastModified: 0, etag: null } };
    if (!response.ok) return { failed: `${response.status} ${response.statusText}`.trim() };
    const models = usableModels(await response.json(), provider, routes);
    return { entry: { provider, url: base, models, lastModified: lastModifiedOf(response), etag: response.headers.get('etag') } };
  } catch (error) {
    if (ctx.job.signal.aborted) throw error;
    return { failed: error instanceof Error ? error.message : String(error) };
  }
}

export async function refreshCatalog(ctx: Ctx, base: string): Promise<void> {
  const catalog = await builtinCatalog();
  const stored = new Map((await readLiveEntries(ctx)).map((entry) => [entry.provider, entry]));
  const providers = catalog.getProviders().map((provider) => provider.id);
  const outcomes = await Promise.all(
    providers.map(async (provider) => {
      const routes = new Set(catalog.getModels(provider).map(routeOf));
      return { provider, outcome: await fetchProvider(ctx, base, provider, routes, stored.get(provider)) };
    }),
  );
  const entries = outcomes.flatMap(({ outcome }) => ('entry' in outcome ? [outcome.entry] : []));
  if (entries.length > 0) await writeLiveEntries(ctx, entries);
  const failure = outcomes.find(({ outcome }) => 'failed' in outcome);
  if (failure !== undefined && 'failed' in failure.outcome) {
    const reason = failure.outcome.failed;
    throw ctx.problem('kvai/PROVIDER_ERROR', { provider: failure.provider, reason, transient: isTransient(reason) });
  }
}
