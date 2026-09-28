import { jsonSchema, llmRequestSchema, llmResultSchema, type Issue, type LlmRequest, type Message, type Problem } from '@kvman/protocol';
import { enabledProviders } from '../llm/enabled-providers.ts';
import { globalDefaults, workspaceDefaults } from '../llm/llm-defaults.ts';
import { readModels } from '../llm/model-rows.ts';
import { resolveModel } from '../llm/model-resolution.ts';
import { costOf } from '../llm/usage-cost.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Connection } from '../storage/driver.ts';
import type { KernelChange } from '../storage/kernel-changes.ts';
import { refusal } from './command-payloads.ts';
import { KernelStopping } from './extension-commands.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { LiveAddress, LiveBus } from './live-bus.ts';
import type { ProviderCall, ProviderOutcome } from './provider-invocations.ts';

export type LlmCallsDeps = {
  connection: Connection;
  commits: KernelCommits;
  registry: RegistryState;
  live: LiveBus;
  provide: (call: ProviderCall) => Promise<ProviderOutcome>;
};

type LiveTargets = { text?: LiveAddress; thinking?: LiveAddress };

// `<type>:<key>` (02 §2.3): the type ends at the first colon.
function addressOf(address: string, workspaceId: string | undefined): LiveAddress {
  const colon = address.indexOf(':');
  return { type: address.slice(0, colon), key: address.slice(colon + 1), workspaceId };
}

// 03 §3.12, 05 §5.11, ADR 0153: kernel.llm.complete. The kernel resolves the model, runs the provider's `complete`
// in its extension's host with the caller's deadline and cancel, relays its deltas as the caller's live events
// (`run` = the calling handler's message), retries retryable failures, and commits the reply with its usage row.
export class LlmCalls {
  readonly #deps: LlmCallsDeps;
  readonly #running = new Map<string, AbortController>();

  constructor(deps: LlmCallsDeps) {
    this.#deps = deps;
  }

  // ADR 0083: a cancelled call's provider run is aborted.
  abortMessages(messageIds: ReadonlySet<string>): void {
    for (const [messageId, controller] of this.#running) if (messageIds.has(messageId)) controller.abort();
  }

  async complete(claim: Claim, stopping: AbortSignal): Promise<void> {
    const { message } = claim;
    const { commits } = this.#deps;
    const request = llmRequestSchema.safeParse(message.payload);
    if (!request.success) return commits.fail(claim, refusal(message, 'VALIDATION_FAILED', { detail: 'the request is not an LlmRequest' }));
    const caller = message.source.startsWith('ext:') ? message.source.slice('ext:'.length) : undefined;
    const refused = this.#callerProblem(message, caller) ?? this.#liveProblem(message, caller, request.data);
    if (refused !== undefined || caller === undefined) return commits.fail(claim, refused ?? refusal(message, 'CAPABILITY_DENIED', { detail: 'only an extension calls models' }));
    const registry = this.#deps.registry.current();
    const providers = enabledProviders(registry, this.#deps.registry.enabled(), message.workspaceId);
    const models = readModels(this.#deps.connection, new Set(providers.keys()));
    const resolution = resolveModel({
      request: request.data, providers: new Set(providers.keys()), models,
      workspace: workspaceDefaults(this.#deps.connection, message.workspaceId), global: globalDefaults(this.#deps.connection),
    });
    if (!resolution.ok) return commits.fail(claim, refusal(message, resolution.code, { detail: resolution.detail }));
    const { model } = resolution;
    const extension = providers.get(model.provider);
    if (extension === undefined) return commits.fail(claim, refusal(message, 'LLM_NOT_CONFIGURED', { detail: `no enabled extension provides ${model.provider}` }));
    const targets = this.#targets(request.data, message.workspaceId);
    const used = new Map<string, LiveAddress>();
    const run = message.causationId ?? message.id;
    const outcome = await this.#provide(claim, { extension, provider: model.provider, request: { ...request.data, model: { provider: model.provider, id: model.id } } }, stopping, (delta) => {
      for (const kind of ['text', 'thinking'] as const) {
        const text = delta[kind];
        const target = targets[kind];
        if (text === undefined || target === undefined) continue;
        used.set(`${target.type}:${target.key}`, target);
        this.#deps.live.publish(target, run, { text });
      }
    });
    if (stopping.aborted) {
      this.#deps.live.reset(run, used.values());
      throw new KernelStopping();
    }
    const result = outcome.ok ? llmResultSchema.safeParse(outcome.value) : undefined;
    if (!outcome.ok || result === undefined || !result.success) {
      if (used.size > 0) this.#deps.live.reset(run, used.values());
      const problem = outcome.ok
        ? refusal(message, 'LLM_CALL_FAILED', { detail: `provider ${model.provider} answered something that is not an LlmResult`, retryable: false })
        : { ...outcome.problem, correlationId: message.correlationId, messageId: message.id };
      return problem.retryable ? commits.retry(claim, problem) : commits.fail(claim, problem);
    }
    const change: KernelChange = { kind: 'llm.usage', messageId: message.id, workspaceId: message.workspaceId, caller, result: result.data, costUsd: costOf(result.data, model) };
    await commits.commit({ origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] }, claim);
  }

  async #provide(
    claim: Claim, target: { extension: string; provider: string; request: LlmRequest }, stopping: AbortSignal,
    onDelta: (delta: { text?: string; thinking?: string }) => void,
  ): Promise<ProviderOutcome> {
    const { message } = claim;
    const controller = new AbortController();
    const stop = (): void => controller.abort();
    stopping.addEventListener('abort', stop);
    this.#running.set(message.id, controller);
    try {
      return await this.#deps.provide({
        extension: target.extension, provider: target.provider, function: 'complete', input: jsonSchema.parse(target.request), workspaceId: message.workspaceId,
        deadlineAt: claim.deadlineAt, correlationId: message.correlationId, signal: controller.signal, onDelta,
      });
    } finally {
      this.#running.delete(message.id);
      stopping.removeEventListener('abort', stop);
    }
  }

  // 03 §3.8: kernel.llm.complete needs the `llm` capability where the caller runs (the intersection for a global call).
  #callerProblem(message: Message, caller: string | undefined): Problem | undefined {
    const granted = caller === undefined ? undefined : this.#deps.registry.capabilities(caller, message.workspaceId);
    if (granted?.requested.some((capability) => capability.name === 'llm') === true) return undefined;
    return refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not call models`, hint: "request ext.requestCapability('llm')" });
  }

  // 05 §5.11: `live.text` and `live.thinking` name live events the caller registered with chunk `text`.
  #liveProblem(message: Message, caller: string | undefined, request: LlmRequest): Problem | undefined {
    const manifest = caller === undefined ? undefined : this.#deps.registry.current().manifestOf(caller);
    const issues: Issue[] = [];
    for (const kind of ['text', 'thinking'] as const) {
      const address = request.live?.[kind];
      if (address === undefined) continue;
      const { type } = addressOf(address, undefined);
      const entry = manifest?.types.find((candidate) => candidate.type === type);
      if (entry?.kind !== 'event' || entry.delivery !== 'live' || entry.chunk !== 'text') {
        issues.push({ path: `live.${kind}`, message: `${type} is not a live event of ${caller ?? message.source} with chunk text` });
      }
    }
    const [first] = issues;
    return first === undefined ? undefined : refusal(message, 'VALIDATION_FAILED', { detail: first.message, issues });
  }

  #targets(request: LlmRequest, workspaceId: string | undefined): LiveTargets {
    const text = request.live?.text;
    const thinking = request.live?.thinking;
    return { ...(text === undefined ? {} : { text: addressOf(text, workspaceId) }), ...(thinking === undefined ? {} : { thinking: addressOf(thinking, workspaceId) }) };
  }
}
