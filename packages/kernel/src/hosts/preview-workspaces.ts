import { mkdirSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { workspacePreviewCreateRequestSchema } from '@kvman/protocol';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Connection } from '../storage/driver.ts';
import { readAppliedPreset } from '../storage/preset-changes.ts';
import { workspaceIdOf } from '../workspaces/workspace-paths.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { SerialChanges } from './serial-changes.ts';
import { readWorkspace } from './workspace-rows.ts';

export type PreviewWorkspacesDeps = {
  connection: Connection;
  commits: KernelCommits;
  registry: RegistryState;
  serial: SerialChanges;
  home: string;
};

// kernel.workspace.preview.create (07 §7.1, ADR 0150): a throwaway workspace under the home folder copying another
// workspace's applied preset and config rows, one at a time with the other registry changes.
export class PreviewWorkspaces {
  readonly #deps: PreviewWorkspacesDeps;

  constructor(deps: PreviewWorkspacesDeps) {
    this.#deps = deps;
  }

  create(claim: Claim): Promise<void> {
    return this.#deps.serial.run(() => this.#create(claim));
  }

  async #create(claim: Claim): Promise<void> {
    const { message } = claim;
    if (!isAdministrator(this.#deps.registry, message)) {
      return this.#deps.commits.fail(claim, refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' }));
    }
    const request = parsed(workspacePreviewCreateRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { name, from } = request.value;
    if (readWorkspace(this.#deps.connection, from) === undefined) {
      return this.#deps.commits.fail(claim, refusal(message, 'WORKSPACE_INVALID', { detail: `no workspace ${from} exists` }));
    }
    if (readAppliedPreset(this.#deps, from) === undefined) {
      return this.#deps.commits.fail(claim, refusal(message, 'PRESET_REQUIRED', { detail: `workspace ${from} has no applied preset`, hint: 'choose a preset for the workspace first' }));
    }
    mkdirSync(join(this.#deps.home, 'previews', name), { recursive: true, mode: 0o700 });
    const path = realpathSync.native(join(this.#deps.home, 'previews', name));
    // Fail closed: a preview's folder is always inside the home folder's previews (07 §7.1).
    if (!path.startsWith(`${join(realpathSync.native(this.#deps.home), 'previews')}${sep}`)) {
      return this.#deps.commits.fail(claim, refusal(message, 'WORKSPACE_INVALID', { detail: `the preview folder of ${name} is not inside the home folder's previews` }));
    }
    const workspaceId = workspaceIdOf(path);
    if (readWorkspace(this.#deps.connection, workspaceId) !== undefined) {
      return this.#deps.commits.fail(claim, refusal(message, 'WORKSPACE_INVALID', { detail: `a preview named ${name} exists`, hint: 'forget it first' }));
    }
    const result = await this.#deps.commits.commit({
      origin: { kind: 'change', change: { kind: 'workspace.preview', workspaceId, path, name, from }, command: message, correlationId: message.correlationId },
      writes: [], sends: [], publishes: [], replies: [],
    }, claim);
    if (result.committed) this.#deps.registry.refresh();
  }
}
