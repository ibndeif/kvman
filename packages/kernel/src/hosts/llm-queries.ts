import {
  jsonSchema, llmDefaultsGetRequestSchema, llmModelsListRequestSchema, llmProvidersListRequestSchema, llmRequestSchema, llmUsageGetRequestSchema,
  providerStatusSchema, type KernelErrorCode, type Message, type Problem,
} from '@kvman/protocol';
import { enabledProviders } from '../llm/enabled-providers.ts';
import { globalDefaults, workspaceDefaults } from '../llm/llm-defaults.ts';
import { readModels } from '../llm/model-rows.ts';
import { resolveModel } from '../llm/model-resolution.ts';
import { estimateTokens } from '../llm/token-estimate.ts';
import { groupUsage, type UsageRecord } from '../llm/usage-rows.ts';
import { kernelProblem } from '../problems.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Connection } from '../storage/driver.ts';
import type { ProviderCall, ProviderOutcome } from './provider-invocations.ts';
import type { QueryAnswer } from './query-path.ts';
import { readWorkspace } from './workspace-rows.ts';

const servingTimeoutMs = 5_000;

export type LlmQueriesDeps = {
  connection: Connection;
  registry: RegistryState;
  provide: (call: ProviderCall) => Promise<ProviderOutcome>;
  now: () => number;
};

// The kernel's LLM reads (03 §3.8, ADRs 0152–0154), answered in memory on the main thread like every query.
export class LlmQueries {
  readonly #deps: LlmQueriesDeps;

  constructor(deps: LlmQueriesDeps) {
    this.#deps = deps;
  }

  modelsList(message: Message): QueryAnswer {
    const { workspaceId } = llmModelsListRequestSchema.parse(message.payload);
    if (workspaceId !== undefined && readWorkspace(this.#deps.connection, workspaceId) === undefined) {
      return { ok: false, problem: this.#refused(message, 'WORKSPACE_INVALID', `no workspace ${workspaceId} exists`) };
    }
    const providers = enabledProviders(this.#deps.registry.current(), this.#deps.registry.enabled(), workspaceId);
    return { ok: true, value: jsonSchema.parse(readModels(this.#deps.connection, new Set(providers.keys()))) };
  }

  // Like kernel.trust.preview, the answer comes later: every provider's status() runs for the workspace.
  async providersList(message: Message): Promise<QueryAnswer> {
    const { workspaceId } = llmProvidersListRequestSchema.parse(message.payload);
    if (readWorkspace(this.#deps.connection, workspaceId) === undefined) {
      return { ok: false, problem: this.#refused(message, 'WORKSPACE_INVALID', `no workspace ${workspaceId} exists`) };
    }
    const registry = this.#deps.registry.current();
    const providers = enabledProviders(registry, this.#deps.registry.enabled(), workspaceId);
    const entries = [...providers].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    const listings = [];
    for (const [id, extension] of entries) {
      const manifest = registry.manifestOf(extension);
      const provider = manifest?.llm.providers.find((entry) => entry.id === id);
      if (provider === undefined) continue;
      listings.push({
        id, title: provider.title, extension, auth: provider.auth,
        configured: await this.#configured(extension, id, workspaceId, message.correlationId),
      });
    }
    return { ok: true, value: jsonSchema.parse(listings) };
  }

  defaultsGet(message: Message): QueryAnswer {
    const { workspaceId } = llmDefaultsGetRequestSchema.parse(message.payload);
    if (workspaceId !== undefined && readWorkspace(this.#deps.connection, workspaceId) === undefined) {
      return { ok: false, problem: this.#refused(message, 'WORKSPACE_INVALID', `no workspace ${workspaceId} exists`) };
    }
    const workspace = workspaceDefaults(this.#deps.connection, workspaceId);
    const global = globalDefaults(this.#deps.connection);
    return { ok: true, value: jsonSchema.parse({ workspace, global, effective: { ...global, ...workspace } }) };
  }

  // The provider's countTokens with exact: true, else the estimate with exact: false (ADR 0154).
  async tokensCount(message: Message): Promise<QueryAnswer> {
    const request = llmRequestSchema.parse(message.payload);
    const caller = message.source.startsWith('ext:') ? message.source.slice('ext:'.length) : undefined;
    const granted = caller === undefined ? undefined : this.#deps.registry.capabilities(caller, message.workspaceId);
    if (granted?.requested.some((capability) => capability.name === 'llm') !== true) {
      return {
        ok: false,
        problem: this.#refused(message, 'CAPABILITY_DENIED', `${message.source} may not count tokens`, "request ext.requestCapability('llm')"),
      };
    }
    const registry = this.#deps.registry.current();
    const providers = enabledProviders(registry, this.#deps.registry.enabled(), message.workspaceId);
    const models = readModels(this.#deps.connection, new Set(providers.keys()));
    const resolution = resolveModel({
      request, providers: new Set(providers.keys()), models,
      workspace: workspaceDefaults(this.#deps.connection, message.workspaceId), global: globalDefaults(this.#deps.connection),
    });
    if (!resolution.ok) return { ok: false, problem: this.#refused(message, resolution.code, resolution.detail) };
    const { model } = resolution;
    const extension = providers.get(model.provider);
    if (extension === undefined) {
      return { ok: false, problem: this.#refused(message, 'LLM_NOT_CONFIGURED', `no enabled extension provides ${model.provider}`) };
    }
    const functions = registry.manifestOf(extension)?.llm.providers.find((entry) => entry.id === model.provider)?.functions ?? [];
    if (!functions.includes(`provider:${model.provider}.countTokens`)) {
      return { ok: true, value: jsonSchema.parse({ tokens: estimateTokens(request), exact: false }) };
    }
    const outcome = await this.#deps.provide({
      extension, provider: model.provider, function: 'countTokens', input: jsonSchema.parse(request),
      workspaceId: message.workspaceId, deadlineAt: this.#deps.now() + servingTimeoutMs, correlationId: message.correlationId, signal: new AbortController().signal,
    });
    if (!outcome.ok) return { ok: false, problem: { ...outcome.problem, correlationId: message.correlationId, messageId: message.id } };
    return typeof outcome.value === 'number' && Number.isInteger(outcome.value) && outcome.value >= 0
      ? { ok: true, value: jsonSchema.parse({ tokens: outcome.value, exact: true }) }
      : {
        ok: false,
        problem: this.#refused(message, 'LLM_CALL_FAILED', `provider ${model.provider} answered something that is not a token count`),
      };
  }

  usageGet(message: Message): QueryAnswer {
    const { workspaceId, from, to, groupBy } = llmUsageGetRequestSchema.parse(message.payload);
    const records = this.#usageRows(workspaceId);
    return { ok: true, value: jsonSchema.parse({ rows: groupUsage(records, { ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }), ...(groupBy === undefined ? {} : { groupBy }) }) }) };
  }

  // ADR 0153: a status that throws, misses its deadline, or answers anything but { configured: boolean } is unconfigured.
  async #configured(extension: string, provider: string, workspaceId: string, correlationId: string): Promise<boolean> {
    const outcome = await this.#deps.provide({
      extension, provider, function: 'status', input: {},
      workspaceId, deadlineAt: this.#deps.now() + servingTimeoutMs, correlationId, signal: new AbortController().signal,
    });
    if (!outcome.ok) return false;
    const parsed = providerStatusSchema.safeParse(outcome.value);
    return parsed.success ? parsed.data.configured : false;
  }

  #usageRows(workspaceId: string | undefined): UsageRecord[] {
    const rows = workspaceId === undefined
      ? this.#deps.connection.prepare('SELECT ws, caller, provider, model, input, output, cache_read, cache_write, cost_usd, at FROM llm_usage ORDER BY at').all()
      : this.#deps.connection.prepare('SELECT ws, caller, provider, model, input, output, cache_read, cache_write, cost_usd, at FROM llm_usage WHERE ws = ? ORDER BY at').all(workspaceId);
    return rows.map((row) => ({
      ws: String(row['ws']), caller: String(row['caller']), provider: String(row['provider']), model: String(row['model']),
      input: Number(row['input']), output: Number(row['output']), cacheRead: Number(row['cache_read']), cacheWrite: Number(row['cache_write']),
      costUsd: row['cost_usd'] === null ? null : Number(row['cost_usd']), at: Number(row['at']),
    }));
  }

  #refused(message: Message, code: KernelErrorCode, detail: string, hint?: string): Problem {
    return kernelProblem(code, { correlationId: message.correlationId, messageId: message.id, detail, ...(hint === undefined ? {} : { hint }) });
  }
}
