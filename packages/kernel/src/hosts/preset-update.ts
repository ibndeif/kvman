import {
  presetSchema, presetUpdateRequestSchema, jsonObjectSchema,
  type Issue, type JsonObject, type Manifest, type Message, type Preset, type Problem,
} from '@kvman/protocol';
import type { SnapshotStore } from '../install/snapshot-store.ts';
import type { DataMigrations } from '../migrations/data-migrations.ts';
import { requiresFrom } from '../presets/enabled-checks.ts';
import { mergePatch } from '../presets/merge-patch.ts';
import { grantDifferences, sameGrants } from '../registry/grant-validity.ts';
import { kernelTypeEntries } from '../registry/kernel-types.ts';
import type { KernelRegistry } from '../registry/kernel-registry.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { Connection } from '../storage/driver.ts';
import { readAppliedPreset } from '../storage/preset-changes.ts';
import { schemaIssues } from '../validation/schema-issues.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import { prepareEnableData } from './enable-data.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { SerialChanges } from './serial-changes.ts';
import { uiProblem, workspaceUi } from '../ui/ui-refusal.ts';
import { readWorkspace } from './workspace-rows.ts';

export type PresetUpdateDeps = {
  connection: Connection;
  commits: KernelCommits;
  scheduler: Scheduler;
  registry: RegistryState;
  snapshots: SnapshotStore;
  migrations: DataMigrations;
  serial: SerialChanges;
  quarantine: (extension: string, reason: 'EXT_INTEGRITY') => Promise<void>;
};

const kernelTypes = new Set(kernelTypeEntries().map((entry) => entry.type));

// 07 §7.4, ADR 0149: the top-level keys a patch may touch; config is changed with kernel.config.set.
const patchableKeys = new Set(['app', 'layout', 'hidden', 'labels', 'pages', 'navGroups', 'nav', 'translations', 'extensions']);

// ADR 0149: the only fields of an entry already in the preset a patch may change.
const patchableEntryKeys = new Set(['enabled', 'grants', 'disable']);

function requiredTypes(manifest: Manifest): string[] {
  return manifest.permissions.requireTypes.flatMap((requirement) => requirement.types);
}

function keyProblem(message: Message, patch: JsonObject): Problem | undefined {
  const issues: Issue[] = [];
  for (const key of Object.keys(patch)) {
    if (patchableKeys.has(key)) continue;
    issues.push({ path: key, message: key === 'config' ? 'config is changed with kernel.config.set' : `${key} cannot be changed with kernel.preset.update` });
  }
  if (issues.length === 0) return undefined;
  return refusal(message, 'PRESET_INVALID', { detail: issues[0]?.message ?? 'the patch touches keys it may not change', issues });
}

function extensionProblem(message: Message, copy: Preset, patch: JsonObject): Problem | undefined {
  const value = patch['extensions'];
  if (value === undefined) return undefined;
  const issues: Issue[] = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    issues.push({ path: 'extensions', message: 'an extensions patch is an object of the entries to change' });
  } else {
    for (const [name, entry] of Object.entries(value)) {
      if (copy.extensions[name] === undefined) {
        issues.push({ path: `extensions.${name}`, message: 'add extensions with kernel.preset.apply or kernel.extension.enable' });
      } else if (entry === null) {
        issues.push({ path: `extensions.${name}`, message: 'remove extensions with kernel.extension.disable' });
      } else if (typeof entry !== 'object' || Array.isArray(entry)) {
        issues.push({ path: `extensions.${name}`, message: 'an extension patch is an object of enabled, grants, and disable' });
      } else {
        for (const key of Object.keys(entry)) {
          if (!patchableEntryKeys.has(key)) issues.push({ path: `extensions.${name}.${key}`, message: 'only enabled, grants, and disable can be changed with kernel.preset.update' });
        }
      }
    }
  }
  if (issues.length === 0) return undefined;
  return refusal(message, 'PRESET_INVALID', { detail: issues[0]?.message ?? 'the extensions patch is not valid', issues });
}

// kernel.preset.update (07 §7.4, ADR 0149): a JSON Merge Patch edit of a workspace's applied preset, re-validated
// like apply; one at a time with the other registry changes.
export class PresetUpdate {
  readonly #deps: PresetUpdateDeps;

  constructor(deps: PresetUpdateDeps) {
    this.#deps = deps;
  }

  update(claim: Claim): Promise<void> {
    return this.#deps.serial.run(() => this.#update(claim));
  }

  async #update(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = parsed(presetUpdateRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { workspaceId, patch, revision } = request.value;
    if (Object.hasOwn(patch, 'extensions') && !message.source.startsWith('user:')) {
      return this.#deps.commits.fail(claim, refusal(message, 'CALLER_NOT_ALLOWED', {
        detail: 'a patch that touches extensions grants capabilities, so only a person may send it',
        hint: 'open the grant dialog',
      }));
    }
    if (!isAdministrator(this.#deps.registry, message)) {
      return this.#deps.commits.fail(claim, refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' }));
    }
    if (readWorkspace(this.#deps.connection, workspaceId) === undefined) {
      return this.#deps.commits.fail(claim, refusal(message, 'WORKSPACE_INVALID', { detail: `no workspace ${workspaceId} exists` }));
    }
    const applied = readAppliedPreset({ connection: this.#deps.connection }, workspaceId);
    if (applied === undefined) {
      return this.#deps.commits.fail(claim, refusal(message, 'PRESET_REQUIRED', { detail: `workspace ${workspaceId} has no applied preset`, hint: 'choose a preset for the workspace first' }));
    }
    if (revision !== applied.revision) {
      return this.#deps.commits.fail(claim, refusal(message, 'PRESET_STALE', {
        detail: `the applied preset is at revision ${applied.revision}, not ${revision}`,
        hint: 'read the current preset and try again',
        params: { revision: applied.revision },
      }));
    }
    const keyed = keyProblem(message, patch);
    if (keyed !== undefined) return this.#deps.commits.fail(claim, keyed);
    const patched = extensionProblem(message, applied.preset, patch);
    if (patched !== undefined) return this.#deps.commits.fail(claim, patched);
    const candidate = mergePatch(jsonObjectSchema.parse(applied.preset), patch);
    const merged = presetSchema.safeParse(
      typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate) ? { ...candidate, revision: applied.revision } : candidate,
    );
    if (!merged.success) {
      const issues = schemaIssues(merged.error.issues);
      return this.#deps.commits.fail(claim, refusal(message, 'PRESET_INVALID', { detail: issues[0]?.message ?? 'the patched preset is not valid', issues }));
    }
    const preset = merged.data;
    const registry = this.#deps.registry.current();
    const granted = this.#grantProblem(message, registry, applied.preset, preset);
    if (granted !== undefined) return this.#deps.commits.fail(claim, granted);
    const used = this.#inUseProblem(message, registry, applied.preset, preset);
    if (used !== undefined) return this.#deps.commits.fail(claim, used);
    const turnedOn = Object.keys(preset.extensions)
      .filter((name) => applied.preset.extensions[name]?.enabled !== true && preset.extensions[name]?.enabled === true)
      .sort();
    const checked = await this.#turnOnChecks(message, registry, preset, turnedOn);
    if (checked !== undefined) return this.#deps.commits.fail(claim, checked);
    const enabled = Object.keys(preset.extensions).filter((name) => preset.extensions[name]?.enabled === true).sort()
      .flatMap((name) => registry.manifestOf(name) ?? []);
    const ui = uiProblem(workspaceUi(registry, enabled, preset, true), { correlationId: message.correlationId, messageId: message.id });
    if (ui !== undefined) return this.#deps.commits.fail(claim, ui);
    const dataVersions = await this.#enableTurnedOn(claim, preset, turnedOn);
    if (dataVersions === undefined) return;
    const result = await this.#deps.commits.commit({
      origin: {
        kind: 'change',
        change: { kind: 'preset.apply', workspaceId, preset, dataVersions, cause: 'update', expectedRevision: revision },
        command: message, correlationId: message.correlationId,
      },
      writes: [], sends: [], publishes: [], replies: [],
    }, claim);
    if (!result.committed) return;
    this.#deps.registry.refresh();
    this.#deps.scheduler.pump();
  }

  // ADR 0149: every entry whose grants changed, or that the patch turns on, holds exactly what its manifest requests
  // and derives (an entry turned on may hold grants of an older version).
  #grantProblem(message: Message, registry: KernelRegistry, copy: Preset, merged: Preset): Problem | undefined {
    for (const name of Object.keys(merged.extensions).sort()) {
      const before = copy.extensions[name];
      const after = merged.extensions[name];
      if (before === undefined || after === undefined) continue;
      const turnedOn = before.enabled !== true && after.enabled === true;
      if (!turnedOn && sameGrants(before.grants, after.grants)) continue;
      const manifest = registry.manifestOf(name);
      if (manifest === undefined) return refusal(message, 'NOT_FOUND', { detail: `no extension ${name} is installed` });
      const differences = grantDifferences(manifest, after.grants, after.source.startsWith('builtin:'));
      if (differences === undefined) continue;
      return refusal(message, 'CAPABILITY_DENIED', {
        detail: 'grants are all or nothing: they must equal what the extension requests',
        params: { missing: differences.missing, unexpected: differences.unexpected, ...(differences.isolation === undefined ? {} : { isolation: differences.isolation }) },
        issues: [
          ...differences.missing.map((label) => ({ path: `extensions.${name}.grants`, message: `missing: ${label}` })),
          ...differences.unexpected.map((label) => ({ path: `extensions.${name}.grants`, message: `not requested: ${label}` })),
          ...(differences.isolation === undefined ? [] : [{ path: `extensions.${name}.grants.isolation`, message: differences.isolation }]),
        ],
      });
    }
    return undefined;
  }

  // 06 §6.4: an entry turned off that another entry enabled in the merged copy requires.
  #inUseProblem(message: Message, registry: KernelRegistry, copy: Preset, merged: Preset): Problem | undefined {
    const enabled = Object.keys(merged.extensions).filter((name) => merged.extensions[name]?.enabled === true);
    for (const name of Object.keys(merged.extensions).sort()) {
      if (copy.extensions[name]?.enabled !== true || merged.extensions[name]?.enabled !== false) continue;
      const provider = registry.manifestOf(name);
      const dependents = enabled.filter((other) => {
        const manifest = registry.manifestOf(other);
        return manifest !== undefined && requiresFrom(manifest, provider);
      }).sort();
      if (dependents.length === 0) continue;
      return refusal(message, 'EXT_IN_USE', {
        detail: `${dependents.join(', ')} ${dependents.length === 1 ? 'requires' : 'require'} ${name} in this workspace`,
        hint: 'disable the dependents first, or together',
        params: { dependents },
      });
    }
    return undefined;
  }

  // The enable checks of 06 §6.4 for every entry the patch turns on, against the merged enabled set.
  async #turnOnChecks(message: Message, registry: KernelRegistry, merged: Preset, turnedOn: readonly string[]): Promise<Problem | undefined> {
    const enabled = Object.keys(merged.extensions).filter((name) => merged.extensions[name]?.enabled === true).sort();
    for (const name of turnedOn) {
      const manifest = registry.manifestOf(name);
      const version = this.#activeVersion(name);
      if (manifest === undefined || version === undefined) {
        return refusal(message, 'NOT_FOUND', { detail: `no extension ${name} is installed` });
      }
      if (registry.isQuarantined(name)) {
        return refusal(message, 'EXT_QUARANTINED', { detail: `${name} is quarantined`, hint: 'resolve the quarantine on the recovery page first' });
      }
      if (!(await this.#deps.snapshots.verify(name))) {
        await this.#deps.quarantine(name, 'EXT_INTEGRITY');
        return refusal(message, 'EXT_INTEGRITY', { detail: `the snapshot of ${name} does not match its digest` });
      }
      const other = enabled.find((candidate) => candidate !== name && registry.manifestOf(candidate)?.meta.namespace === manifest.meta.namespace);
      if (other !== undefined) {
        return refusal(message, 'NAMESPACE_CONFLICT', { detail: `${other} already owns the namespace "${manifest.meta.namespace}" in this workspace`, hint: `disable ${other} first` });
      }
      const providerOwners = new Map<string, string>();
      for (const candidate of enabled) {
        if (candidate === name) continue;
        for (const provider of registry.manifestOf(candidate)?.llm.providers ?? []) providerOwners.set(provider.id, candidate);
      }
      const clash = manifest.llm.providers.find((provider) => providerOwners.has(provider.id));
      const owner = clash === undefined ? undefined : providerOwners.get(clash.id);
      if (clash !== undefined && owner !== undefined) {
        return refusal(message, 'PROVIDER_CONFLICT', { detail: `${owner} and ${name} both provide "${clash.id}"`, hint: `disable ${owner} first` });
      }
      const provided = new Set(enabled.flatMap((candidate) => registry.manifestOf(candidate)?.types.map((entry) => entry.type) ?? []));
      const types = requiredTypes(manifest).filter((type) => !provided.has(type) && !kernelTypes.has(type));
      if (types.length > 0) {
        return refusal(message, 'EXT_REQUIRES_MISSING', {
          detail: `no extension enabled here provides ${types.join(', ')}`,
          hint: 'enable the extensions that provide them first',
          params: { types },
          issues: types.map((type) => ({ path: 'requireTypes', message: `${type} is not provided` })),
        });
      }
    }
    return undefined;
  }

  // 04 §4.8, like enable: the data migrations and config check of every entry the patch turns on. An update the
  // kernel's shutdown interrupted stays running and is redelivered at the next start (ADR 0091).
  async #enableTurnedOn(claim: Claim, merged: Preset, turnedOn: readonly string[]): Promise<Record<string, number> | undefined> {
    const { message } = claim;
    const dataVersions: Record<string, number> = {};
    for (const name of turnedOn) {
      const entry = merged.extensions[name];
      const version = this.#activeVersion(name);
      if (entry === undefined || version === undefined) continue;
      const data = await prepareEnableData(this.#deps, message, name, version.digest, entry.grants);
      if (!data.ok && data.problem.code === 'KERNEL_STOPPING') return undefined;
      if (!data.ok) {
        await this.#deps.commits.fail(claim, data.problem);
        return undefined;
      }
      dataVersions[name] = data.version;
    }
    return dataVersions;
  }

  #activeVersion(name: string): { source: string; integrity?: string; digest: string } | undefined {
    const row = this.#deps.connection
      .prepare('SELECT v.source, v.integrity, v.digest FROM extensions e JOIN extension_versions v ON v.name = e.name AND v.digest = e.active_digest WHERE e.name = ?')
      .get(name);
    if (row === undefined) return undefined;
    const integrity = row['integrity'];
    return { source: String(row['source']), ...(typeof integrity === 'string' ? { integrity } : {}), digest: String(row['digest']) };
  }
}
