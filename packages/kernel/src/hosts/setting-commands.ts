import { configSecretFields, configSetRequestSchema, secretClearRequestSchema, secretSetRequestSchema, type Manifest, type Message, type Problem } from '@kvman/protocol';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Connection } from '../storage/driver.ts';
import type { KernelChange } from '../storage/kernel-changes.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import type { KernelCommits } from './kernel-commits.ts';
import { readWorkspace } from './workspace-rows.ts';

export type SettingCommandsDeps = { connection: Connection; commits: KernelCommits; registry: RegistryState };

type Configured = { ok: true; manifest: Manifest; secrets: string[] } | { ok: false; problem: Problem };

// kernel.config.set, kernel.secret.set, and kernel.secret.clear (07 §7.5, ADRs 0125, 0126): admin only, for any
// installed extension that registers config, enabled or not.
export class SettingCommands {
  readonly #deps: SettingCommandsDeps;

  constructor(deps: SettingCommandsDeps) {
    this.#deps = deps;
  }

  async setConfig(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = this.#admitted(message, parsed(configSetRequestSchema, message));
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { extension, scope, workspaceId, value, revision } = request.value;
    const configured = this.#configured(message, extension);
    if (!configured.ok) return this.#deps.commits.fail(claim, configured.problem);
    const workspaceProblem = this.#workspaceProblem(message, scope, workspaceId);
    if (workspaceProblem !== undefined) return this.#deps.commits.fail(claim, workspaceProblem);
    await this.#change(claim, { kind: 'config.set', extension, scope, ...(workspaceId === undefined ? {} : { workspaceId }), value, revision });
  }

  async setSecret(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = this.#admitted(message, parsed(secretSetRequestSchema, message));
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { extension, name, value } = request.value;
    const problem = this.#secretProblem(message, extension, name);
    if (problem !== undefined) return this.#deps.commits.fail(claim, problem);
    await this.#change(claim, { kind: 'secret.set', extension, name, value });
  }

  async clearSecret(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = this.#admitted(message, parsed(secretClearRequestSchema, message));
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { extension, name } = request.value;
    const problem = this.#secretProblem(message, extension, name);
    if (problem !== undefined) return this.#deps.commits.fail(claim, problem);
    await this.#change(claim, { kind: 'secret.clear', extension, name });
  }

  async #change(claim: Claim, change: KernelChange): Promise<void> {
    const { message } = claim;
    await this.#deps.commits.commit({ origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] }, claim);
  }

  // Foreign writes are admin only (07 §7.5): a person, the kernel, or kernel.admin.
  #admitted<T>(message: Message, request: { ok: true; value: T } | { ok: false; problem: Problem }): { ok: true; value: T } | { ok: false; problem: Problem } {
    if (isAdministrator(this.#deps.registry, message)) return request;
    return { ok: false, problem: refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin; an extension sets its own config with ctx.config.set' }) };
  }

  #configured(message: Message, extension: string): Configured {
    const manifest = this.#deps.registry.current().manifestOf(extension);
    if (manifest === undefined) return { ok: false, problem: refusal(message, 'NOT_FOUND', { detail: `no extension ${extension} is installed` }) };
    if (manifest.config === null) return { ok: false, problem: refusal(message, 'NOT_FOUND', { detail: `${extension} has no config` }) };
    return { ok: true, manifest, secrets: configSecretFields(manifest.config.schema) };
  }

  #workspaceProblem(message: Message, scope: 'global' | 'workspace', workspaceId: string | undefined): Problem | undefined {
    if (scope === 'global') {
      return workspaceId === undefined ? undefined : refusal(message, 'VALIDATION_FAILED', { detail: 'a global value takes no workspaceId', issues: [{ path: 'workspaceId', message: 'a global value takes no workspaceId' }] });
    }
    if (workspaceId === undefined) return refusal(message, 'VALIDATION_FAILED', { detail: 'a workspace value needs a workspaceId', issues: [{ path: 'workspaceId', message: 'a workspace value needs a workspaceId' }] });
    return readWorkspace(this.#deps.connection, workspaceId) === undefined ? refusal(message, 'WORKSPACE_INVALID', { detail: `no workspace ${workspaceId} exists` }) : undefined;
  }

  // ADR 0126: kernel.secret.* name one of the extension's declared secret fields.
  #secretProblem(message: Message, extension: string, name: string): Problem | undefined {
    const configured = this.#configured(message, extension);
    if (!configured.ok) return configured.problem;
    if (configured.secrets.includes(name)) return undefined;
    const declared = configured.secrets;
    return refusal(message, 'VALIDATION_FAILED', {
      detail: `${extension} declares no secret ${name}; its secrets are: ${declared.length === 0 ? 'none' : declared.join(', ')}`, params: { declared },
      issues: [{ path: 'name', message: `${name} is not a declared secret field` }],
    });
  }
}
