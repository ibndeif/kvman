import {
  canonicalJson, compareByCodePoint, configChangedSchema, jsonSchema, listedModelSchema, llmModelsRefreshRequestSchema, modelDefSchema, type ListedModel,
  type Manifest,
} from '@kvman/protocol';
import { isAdministrator } from '../hosts/administrators.ts';
import { parsed, refusal } from '../hosts/command-payloads.ts';
import type { KernelCommits } from '../hosts/kernel-commits.ts';
import type { KernelLogger } from '../hosts/kernel-logger.ts';
import type { ProviderCall, ProviderOutcome } from '../hosts/provider-invocations.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { AppliedMessages } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import type { UlidGenerator } from '../ulid.ts';
import type { StoredModel } from './model-rows.ts';

const listModelsTimeoutMs = 60_000;

function byId(left: StoredModel, right: StoredModel): number {
  return compareByCodePoint(left.id, right.id);
}

// The kernel never imports zod: a listModels answer is an array whose every entry parses as a listed model.
function listedModelsOf(value: unknown): ListedModel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const models: ListedModel[] = [];
  for (const entry of value) {
    const parsed = listedModelSchema.safeParse(entry);
    if (!parsed.success) return undefined;
    models.push(parsed.data);
  }
  return models;
}

export type ModelRefreshDeps = {
  connection: Connection;
  registry: RegistryState;
  pipeline: CommitPipeline;
  commits: KernelCommits;
  provide: (call: ProviderCall) => Promise<ProviderOutcome>;
  logger: KernelLogger;
  now: () => number;
  ids: UlidGenerator;
};

type Snapshot = Map<string, { digest: string | undefined; enabled: boolean }>;

// ADR 0152: the model registry refresh. A refresh rewrites one provider's `llm_models` rows (its static models plus
// what `listModels` returns) and publishes `kernel.llm.models.changed` when they changed. Refreshes of one provider
// never run concurrently.
export class ModelRefresh {
  readonly #deps: ModelRefreshDeps;
  readonly #queues = new Map<string, Promise<void>>();
  #previous: Snapshot = new Map();

  constructor(deps: ModelRefreshDeps) {
    this.#deps = deps;
  }

  start(): void {
    this.#previous = this.#snapshot();
    this.#deps.registry.onRefresh(() => this.#registryRefreshed());
    this.#deps.pipeline.observe((applied) => this.#committed(applied));
  }

  // The command's refresh, for one provider or all; each provider's refresh runs once it is its turn.
  async refresh(provider: string | undefined, correlationId: string): Promise<void> {
    const providers = this.#providers(provider);
    await Promise.all(providers.map((id) => this.#queued(id, correlationId)));
  }

  // kernel.llm.models.refresh (ADR 0152): admin only; an unknown provider is NOT_FOUND; the reply follows the refresh.
  async refreshCommand(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = parsed(llmModelsRefreshRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    if (!isAdministrator(this.#deps.registry, message)) {
      return this.#deps.commits.fail(claim, refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' }));
    }
    if (request.value.provider !== undefined && this.#providerOf(request.value.provider) === undefined) {
      return this.#deps.commits.fail(claim, refusal(message, 'NOT_FOUND', { detail: `no provider ${request.value.provider} is registered` }));
    }
    await this.refresh(request.value.provider, message.correlationId);
    await this.#deps.commits.reply(claim, {});
  }

  async refreshExtension(extension: string, correlationId: string): Promise<void> {
    const manifest = this.#deps.registry.current().manifestOf(extension);
    if (manifest === undefined || this.#deps.registry.current().isQuarantined(extension)) return;
    await Promise.all(manifest.llm.providers.map((provider) => this.#queued(provider.id, correlationId)));
  }

  #providers(only: string | undefined): string[] {
    const ids: string[] = [];
    for (const manifest of this.#deps.registry.current().listed(undefined)) {
      for (const provider of manifest.llm.providers) {
        if (only === undefined || provider.id === only) ids.push(provider.id);
      }
    }
    return [...new Set(ids)].sort();
  }

  // Each provider's refreshes run one after another; a failed one is reported to its own caller, and the next still runs.
  #queued(provider: string, correlationId: string): Promise<void> {
    const previous = this.#queues.get(provider);
    const next = Promise.allSettled(previous === undefined ? [] : [previous]).then(() => this.#refreshOne(provider, correlationId));
    this.#queues.set(provider, next);
    void Promise.allSettled([next]).then(() => {
      if (this.#queues.get(provider) === next) this.#queues.delete(provider);
    });
    return next;
  }

  // A refresh no command waits for reports its failure in the log, with the error's name only.
  #refreshInBackground(extension: string, correlationId: string): void {
    this.refreshExtension(extension, correlationId).catch((error: unknown) => {
      this.#deps.logger.write({ level: 'error', message: 'the models of an extension could not be refreshed', fields: { extension, error: error instanceof Error ? error.name : 'unknown' }, attributes: { correlationId } });
    });
  }

  async #refreshOne(provider: string, correlationId: string): Promise<void> {
    const found = this.#providerOf(provider);
    if (found === undefined) return;
    const { manifest } = found;
    const rows = await this.#rows(provider, manifest, correlationId);
    const stored = this.#stored(provider);
    if (canonicalJson(jsonSchema.parse(rows)) === canonicalJson(jsonSchema.parse(stored))) return;
    const result = await this.#deps.pipeline.enqueue({
      origin: { kind: 'change', change: { kind: 'llm.models', provider, models: rows }, correlationId },
      writes: [], sends: [], publishes: [], replies: [],
    });
    if (!result.committed) {
      this.#deps.logger.write({
        level: 'error', message: 'the models could not be refreshed', fields: { code: result.problem.code },
        attributes: { correlationId },
      });
    }
  }

  #providerOf(provider: string): { manifest: Manifest } | undefined {
    for (const manifest of this.#deps.registry.current().listed(undefined)) {
      if (manifest.llm.providers.some((entry) => entry.id === provider)) return { manifest };
    }
    return undefined;
  }

  async #rows(provider: string, manifest: Manifest, correlationId: string): Promise<StoredModel[]> {
    const extension = manifest.meta.name;
    const statics = manifest.llm.models
      .filter((model) => model.provider === provider)
      .map((model): StoredModel => {
        const { id, ...definition } = model;
        return { id, extension, source: 'static', definition };
      });
    if (!manifest.llm.providers.find((entry) => entry.id === provider)?.functions.includes(`provider:${provider}.listModels`)) {
      return [...statics].sort(byId);
    }
    const listed = await this.#listed(provider, extension, correlationId);
    if (listed === undefined) {
      const kept = this.#stored(provider).filter((row) => row.source === 'listed');
      return [...statics, ...kept].sort(byId);
    }
    const staticIds = new Set(statics.map((row) => row.id));
    const fresh = listed
      .filter((model) => !staticIds.has(model.id))
      .map((model): StoredModel => {
        const { id, ...rest } = model;
        return { id, extension, source: 'listed', definition: { ...rest, provider } };
      });
    return [...statics, ...fresh].sort(byId);
  }

  // `listModels` runs without a workspace (ADR 0153); a failure keeps the stored listed rows and warns.
  async #listed(provider: string, extension: string, correlationId: string): Promise<ListedModel[] | undefined> {
    const outcome = await this.#deps.provide({
      extension, provider, function: 'listModels', input: {},
      workspaceId: undefined, deadlineAt: this.#deps.now() + listModelsTimeoutMs, correlationId, signal: new AbortController().signal,
    });
    if (!outcome.ok) {
      this.#deps.logger.write({ level: 'warn', message: 'listing the models of a provider failed', fields: { provider }, attributes: { correlationId } });
      return undefined;
    }
    const parsed = listedModelsOf(outcome.value);
    if (parsed === undefined) {
      this.#deps.logger.write({ level: 'warn', message: 'listing the models of a provider failed', fields: { provider }, attributes: { correlationId } });
      return undefined;
    }
    return parsed;
  }

  #stored(provider: string): StoredModel[] {
    return this.#deps.connection
      .prepare('SELECT id, extension, info, source FROM llm_models WHERE provider = ? ORDER BY id')
      .all(provider)
      .map((row) => ({
        id: String(row['id']), extension: String(row['extension']), source: row['source'] === 'listed' ? 'listed' : 'static',
        definition: modelDefSchema.parse(JSON.parse(String(row['info']))),
      } satisfies StoredModel))
      .sort(byId);
  }

  #snapshot(): Snapshot {
    const { registry } = this.#deps;
    const enabled = new Set([...registry.enabled().values()].flatMap((names) => names));
    const snapshot: Snapshot = new Map();
    for (const manifest of registry.current().listed(undefined)) {
      if (manifest.llm.providers.length === 0) continue;
      snapshot.set(manifest.meta.name, { digest: registry.digestOf(manifest.meta.name), enabled: enabled.has(manifest.meta.name) });
    }
    return snapshot;
  }

  // After a registry refresh: refresh the providers of an extension that became enabled somewhere, or reloaded.
  #registryRefreshed(): void {
    const current = this.#snapshot();
    const correlationId = this.#deps.ids.next();
    for (const [name, state] of current) {
      const before = this.#previous.get(name);
      if (before === undefined ? state.enabled : (state.enabled && !before.enabled) || state.digest !== before.digest) {
        this.#refreshInBackground(name, correlationId);
      }
    }
    this.#previous = current;
  }

  // After a committed config or secret write of an extension: refresh its providers once the write committed.
  #committed(applied: AppliedMessages): void {
    const extensions = new Set<string>();
    for (const { event } of applied.logged) {
      if (event.type !== 'kernel.config.changed') continue;
      const payload = configChangedSchema.safeParse(event.payload);
      if (payload.success) extensions.add(payload.data.extension);
    }
    for (const change of applied.secrets) extensions.add(change.extension);
    for (const extension of extensions) {
      this.#refreshInBackground(extension, applied.correlationId);
    }
  }
}
