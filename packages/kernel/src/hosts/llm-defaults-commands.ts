import { llmDefaultsSetRequestSchema, type Message, type ModelRef, type Problem } from '@kvman/protocol';
import { enabledProviders } from '../llm/enabled-providers.ts';
import { readModels } from '../llm/model-rows.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Connection } from '../storage/driver.ts';
import type { KernelChange } from '../storage/kernel-changes.ts';
import { readAppliedPreset } from '../storage/preset-changes.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { SerialChanges } from './serial-changes.ts';
import { readWorkspace } from './workspace-rows.ts';

export type LlmDefaultsCommandsDeps = {
  connection: Connection;
  commits: KernelCommits;
  registry: RegistryState;
  serial: SerialChanges;
};

// kernel.llm.defaults.set (ADR 0152): a workspace default is a preset write with cause update, a global default
// writes the kernel_settings row; one at a time with the other registry changes.
export class LlmDefaultsCommands {
  readonly #deps: LlmDefaultsCommandsDeps;

  constructor(deps: LlmDefaultsCommandsDeps) {
    this.#deps = deps;
  }

  set(claim: Claim): Promise<void> {
    return this.#deps.serial.run(() => this.#set(claim));
  }

  async #set(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = parsed(llmDefaultsSetRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    if (!isAdministrator(this.#deps.registry, message)) {
      return this.#deps.commits.fail(claim, refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' }));
    }
    const { workspaceId, purpose, model } = request.value;
    if (workspaceId !== undefined) {
      if (readWorkspace(this.#deps.connection, workspaceId) === undefined) {
        return this.#deps.commits.fail(claim, refusal(message, 'WORKSPACE_INVALID', { detail: `no workspace ${workspaceId} exists` }));
      }
      if (readAppliedPreset({ connection: this.#deps.connection }, workspaceId) === undefined) {
        return this.#deps.commits.fail(claim, refusal(message, 'PRESET_REQUIRED', { detail: `workspace ${workspaceId} has no applied preset`, hint: 'choose a preset for the workspace first' }));
      }
    }
    const problem = this.#modelProblem(message, workspaceId, model);
    if (problem !== undefined) return this.#deps.commits.fail(claim, problem);
    const change: KernelChange = { kind: 'llm.defaults', workspaceId, purpose, model };
    const result = await this.#deps.commits.commit({
      origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [],
    }, claim);
    if (!result.committed) return;
    if (workspaceId !== undefined) this.#deps.registry.refresh();
  }

  #modelProblem(message: Message, workspaceId: string | undefined, model: ModelRef | null): Problem | undefined {
    if (model === null) return undefined;
    const providers = enabledProviders(this.#deps.registry.current(), this.#deps.registry.enabled(), workspaceId);
    const known = readModels(this.#deps.connection, new Set(providers.keys()))
      .some((candidate) => candidate.provider === model.provider && candidate.id === model.id);
    return known ? undefined : refusal(message, 'LLM_MODEL_NOT_FOUND', { detail: `no enabled provider has the model ${model.provider}/${model.id}` });
  }
}
