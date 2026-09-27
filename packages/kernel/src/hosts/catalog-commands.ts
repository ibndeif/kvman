import { presetDeleteRequestSchema, presetImportRequestSchema, presetSaveRequestSchema, type Preset } from '@kvman/protocol';
import { presetWithConfig, withoutDigests } from '../presets/applied-config.ts';
import type { PresetImportTokens } from '../presets/import-tokens.ts';
import { checkShareablePreset } from '../presets/preset-check.ts';
import { presetIdFor } from '../presets/preset-ids.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Connection } from '../storage/driver.ts';
import { readCatalogPreset } from '../storage/catalog-rows.ts';
import type { KernelChange } from '../storage/kernel-changes.ts';
import { readAppliedPreset } from '../storage/preset-changes.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { SerialChanges } from './serial-changes.ts';
import { readWorkspace } from './workspace-rows.ts';

export type CatalogCommandsDeps = {
  connection: Connection;
  commits: KernelCommits;
  serial: SerialChanges;
  tokens: PresetImportTokens;
  grants: GrantsSource;
  registry: () => KernelRegistry;
};

// 07 §7.4, ADRs 0147 and 0149: kernel.preset.import, kernel.preset.save, and kernel.preset.delete.
export class CatalogCommands {
  readonly #connection: Connection;
  readonly #commits: KernelCommits;
  readonly #serial: SerialChanges;
  readonly #tokens: PresetImportTokens;
  readonly #grants: GrantsSource;
  readonly #registry: () => KernelRegistry;

  constructor(deps: CatalogCommandsDeps) {
    this.#connection = deps.connection;
    this.#commits = deps.commits;
    this.#serial = deps.serial;
    this.#tokens = deps.tokens;
    this.#grants = deps.grants;
    this.#registry = deps.registry;
  }

  import(claim: Claim): Promise<void> {
    return this.#serial.run(() => this.#import(claim));
  }

  save(claim: Claim): Promise<void> {
    return this.#serial.run(() => this.#save(claim));
  }

  delete(claim: Claim): Promise<void> {
    return this.#serial.run(() => this.#delete(claim));
  }

  async #import(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = parsed(presetImportRequestSchema, message);
    if (!request.ok) return this.#commits.fail(claim, request.problem);
    const preset = this.#tokens.verify(request.value.confirmationToken);
    if (preset === undefined) {
      return this.#commits.fail(claim, refusal(message, 'CONFIRMATION_EXPIRED', { detail: 'the preview expired or was changed', hint: 'preview the preset again' }));
    }
    const change: KernelChange = { kind: 'catalog.write', preset, builtin: false, cause: 'import' };
    await this.#commits.commit({ origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] }, claim);
  }

  // ADR 0149: the workspace's applied copy, renamed and with its config rows, saved as a new catalog entry.
  async #save(claim: Claim): Promise<void> {
    const { message } = claim;
    if (!isAdministrator(this.#grants, message)) {
      return this.#commits.fail(claim, refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' }));
    }
    const request = parsed(presetSaveRequestSchema, message);
    if (!request.ok) return this.#commits.fail(claim, request.problem);
    const { workspaceId, name, description } = request.value;
    if (readWorkspace(this.#connection, workspaceId) === undefined) {
      return this.#commits.fail(claim, refusal(message, 'WORKSPACE_INVALID', { detail: `no workspace ${workspaceId} exists` }));
    }
    const applied = readAppliedPreset({ connection: this.#connection }, workspaceId);
    if (applied === undefined) {
      return this.#commits.fail(claim, refusal(message, 'PRESET_REQUIRED', { detail: `workspace ${workspaceId} has no applied preset`, hint: 'choose a preset for the workspace first' }));
    }
    const presetId = presetIdFor(name, (id) => readCatalogPreset(this.#connection, id) !== undefined);
    const renamed: Preset = { ...withoutDigests(applied.preset), id: presetId, name, revision: 1 };
    delete renamed.description;
    if (description !== undefined) renamed.description = description;
    const copy = presetWithConfig(this.#connection, workspaceId, renamed);
    const checked = checkShareablePreset(copy, this.#registry().configSchemas());
    if (!checked.ok) {
      return this.#commits.fail(claim, refusal(message, checked.code, { detail: checked.issues[0]?.message ?? checked.code, issues: checked.issues }));
    }
    const change: KernelChange = { kind: 'catalog.write', preset: checked.preset, builtin: false, cause: 'save' };
    await this.#commits.commit({ origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] }, claim);
  }

  async #delete(claim: Claim): Promise<void> {
    const { message } = claim;
    if (!isAdministrator(this.#grants, message)) {
      return this.#commits.fail(claim, refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' }));
    }
    const request = parsed(presetDeleteRequestSchema, message);
    if (!request.ok) return this.#commits.fail(claim, request.problem);
    const change: KernelChange = { kind: 'catalog.delete', presetId: request.value.presetId, cause: 'delete' };
    await this.#commits.commit({ origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] }, claim);
  }
}
