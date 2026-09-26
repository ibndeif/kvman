import { workspaceOpenRequestSchema, workspaceRenameRequestSchema, type Message, type Problem } from '@kvman/protocol';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Connection } from '../storage/driver.ts';
import type { KernelChange } from '../storage/kernel-changes.ts';
import { checkFolder } from '../workspaces/workspace-paths.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import type { KernelCommits } from './kernel-commits.ts';

export type WorkspaceCommandsDeps = {
  connection: Connection;
  commits: KernelCommits;
  registry: RegistryState;
  home: string;
};

// kernel.workspace.open and rename (07 §7.1, ADR 0127); forget is WorkspaceForgetting.
export class WorkspaceCommands {
  readonly #deps: WorkspaceCommandsDeps;

  constructor(deps: WorkspaceCommandsDeps) {
    this.#deps = deps;
  }

  async open(claim: Claim): Promise<void> {
    const { message } = claim;
    const denied = this.#denied(message);
    if (denied !== undefined) return this.#deps.commits.fail(claim, denied);
    const request = parsed(workspaceOpenRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const checked = checkFolder(request.value.path, this.#deps.home);
    if (!checked.ok) return this.#deps.commits.fail(claim, refusal(message, checked.code, { detail: checked.detail }));
    await this.#change(claim, { kind: 'workspace.open', ...checked.folder });
  }

  async rename(claim: Claim): Promise<void> {
    const { message } = claim;
    const denied = this.#denied(message);
    if (denied !== undefined) return this.#deps.commits.fail(claim, denied);
    const request = parsed(workspaceRenameRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    await this.#change(claim, { kind: 'workspace.rename', workspaceId: request.value.workspaceId, name: request.value.name });
  }

  async #change(claim: Claim, change: KernelChange): Promise<void> {
    const { message } = claim;
    await this.#deps.commits.commit({ origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] }, claim);
  }

  #denied(message: Message): Problem | undefined {
    if (isAdministrator(this.#deps.registry, message)) return undefined;
    return refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' });
  }
}
