import { extensionDisableRequestSchema, extensionEnableRequestSchema, type ExtensionEnableRequest, type Manifest, type Message, type Problem } from '@kvman/protocol';
import type { SnapshotStore } from '../install/snapshot-store.ts';
import type { DataMigrations } from '../migrations/data-migrations.ts';
import { grantDifferences } from '../registry/grant-validity.ts';
import { kernelTypeEntries } from '../registry/kernel-types.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { Connection } from '../storage/driver.ts';
import type { KernelChange } from '../storage/kernel-changes.ts';
import { readAppliedPreset, type PresetEntry } from '../storage/preset-changes.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import { prepareEnableData } from './enable-data.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { SerialChanges } from './serial-changes.ts';
import { readWorkspace, readWorkspaceKind } from './workspace-rows.ts';

export type EnableCommandsDeps = {
  connection: Connection;
  commits: KernelCommits;
  scheduler: Scheduler;
  registry: RegistryState;
  snapshots: SnapshotStore;
  migrations: DataMigrations;
  serial: SerialChanges;
  quarantine: (extension: string, reason: 'EXT_INTEGRITY') => Promise<void>;
};

type ActiveVersion = { source: string; integrity?: string; digest: string };

const kernelTypes = new Set(kernelTypeEntries().map((entry) => entry.type));

function requiredTypes(manifest: Manifest): string[] {
  return manifest.permissions.requireTypes.flatMap((requirement) => requirement.types);
}

// kernel.extension.enable and disable (06 §6.4, ADR 0123), one at a time with the other registry changes.
export class EnableCommands {
  readonly #deps: EnableCommandsDeps;

  constructor(deps: EnableCommandsDeps) {
    this.#deps = deps;
  }

  enable(claim: Claim): Promise<void> {
    return this.#deps.serial.run(() => this.#enable(claim));
  }

  disable(claim: Claim): Promise<void> {
    return this.#deps.serial.run(() => this.#disable(claim));
  }

  async #enable(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = parsed(extensionEnableRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const checked = await this.#enableCheck(message, request.value);
    if (!checked.ok) return this.#deps.commits.fail(claim, checked.problem);
    const { workspaceId, name, grants } = request.value;
    const data = await prepareEnableData(this.#deps, message, name, checked.version.digest, grants);
    // An enable the kernel's shutdown interrupted stays running and is redelivered at the next start (ADR 0091).
    if (!data.ok && data.problem.code === 'KERNEL_STOPPING') return undefined;
    if (!data.ok) return this.#deps.commits.fail(claim, data.problem);
    const entry: PresetEntry = { ...checked.version, enabled: true, grants };
    await this.#change(claim, { kind: 'extension.enable', workspaceId, name, entry, dataVersion: data.version });
  }

  async #disable(claim: Claim): Promise<void> {
    const { message } = claim;
    if (!isAdministrator(this.#deps.registry, message)) {
      return this.#deps.commits.fail(claim, refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' }));
    }
    const request = parsed(extensionDisableRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { workspaceId, name } = request.value;
    if (readWorkspace(this.#deps.connection, workspaceId) === undefined) return this.#deps.commits.fail(claim, refusal(message, 'WORKSPACE_INVALID', { detail: `no workspace ${workspaceId} exists` }));
    const dependents = this.#dependents(workspaceId, name);
    if (dependents.length > 0) {
      const detail = `${dependents.join(', ')} ${dependents.length === 1 ? 'requires' : 'require'} ${name} in this workspace`;
      return this.#deps.commits.fail(claim, refusal(message, 'EXT_IN_USE', { detail, hint: 'disable the dependents first, or together', params: { dependents } }));
    }
    await this.#change(claim, { kind: 'extension.disable', workspaceId, name });
  }

  async #change(claim: Claim, change: KernelChange): Promise<void> {
    const { message } = claim;
    const result = await this.#deps.commits.commit({ origin: { kind: 'change', change, command: message, correlationId: message.correlationId }, writes: [], sends: [], publishes: [], replies: [] }, claim);
    if (!result.committed) return;
    this.#deps.registry.refresh();
    this.#deps.scheduler.pump();
  }

  // The checks of ADR 0123 in order; the first that fails is the reply.
  async #enableCheck(message: Message, request: ExtensionEnableRequest): Promise<{ ok: true; version: ActiveVersion } | { ok: false; problem: Problem }> {
    const refused = (problem: Problem) => ({ ok: false, problem }) as const;
    const { workspaceId, name, grants } = request;
    if (readWorkspace(this.#deps.connection, workspaceId) === undefined) return refused(refusal(message, 'WORKSPACE_INVALID', { detail: `no workspace ${workspaceId} exists` }));
    const caller = this.#callerProblem(message, workspaceId, name);
    if (caller !== undefined) return refused(caller);
    if (readAppliedPreset(this.#deps, workspaceId) === undefined) {
      return refused(refusal(message, 'PRESET_REQUIRED', { detail: `workspace ${workspaceId} has no applied preset`, hint: 'choose a preset for the workspace first' }));
    }
    const registry = this.#deps.registry.current();
    const manifest = registry.manifestOf(name);
    const version = this.#activeVersion(name);
    if (manifest === undefined || version === undefined) return refused(refusal(message, 'NOT_FOUND', { detail: `no extension ${name} is installed` }));
    const limited = this.#devLimitProblem(message, workspaceId, grants, version.source);
    if (limited !== undefined) return refused(limited);
    if (registry.isQuarantined(name)) return refused(refusal(message, 'EXT_QUARANTINED', { detail: `${name} is quarantined`, hint: 'resolve the quarantine on the recovery page first' }));
    if (!(await this.#deps.snapshots.verify(name))) {
      await this.#deps.quarantine(name, 'EXT_INTEGRITY');
      return refused(refusal(message, 'EXT_INTEGRITY', { detail: `the snapshot of ${name} does not match its digest` }));
    }
    const problem = this.#namespaceProblem(message, workspaceId, manifest)
      ?? this.#providerProblem(message, workspaceId, manifest)
      ?? this.#grantProblem(message, manifest, grants, version.source.startsWith('builtin:'))
      ?? this.#requiresProblem(message, workspaceId, manifest);
    return problem === undefined ? { ok: true, version } : refused(problem);
  }

  // 07 §7.1, ADR 0150: a person (and the kernel) may enable anywhere; an extension with kernel.admin only a
  // dev: source in a preview workspace, without the grant dialog; anyone else is refused.
  #callerProblem(message: Message, workspaceId: string, name: string): Problem | undefined {
    if (message.source === 'kernel' || message.source.startsWith('user:')) return undefined;
    if (!isAdministrator(this.#deps.registry, message)) {
      return refusal(message, 'CALLER_NOT_ALLOWED', { detail: `only a person may enable ${name} in workspace ${workspaceId}`, hint: 'an extension with kernel.admin may enable a dev version in a preview workspace' });
    }
    const preview = readWorkspaceKind(this.#deps.connection, workspaceId) === 'preview';
    const source = this.#activeVersion(name)?.source;
    if (!preview || source === undefined || !source.startsWith('dev:')) {
      return refusal(message, 'CALLER_NOT_ALLOWED', { detail: `only a person may enable ${name} in workspace ${workspaceId}`, hint: 'an extension with kernel.admin may enable a dev version in a preview workspace' });
    }
    return undefined;
  }

  // 06 §6.4, ADR 0150: every enable of a dev: source in a preview workspace, a person's too, runs sandboxed and is
  // never granted process, network, or kernel.admin.
  #devLimitProblem(message: Message, workspaceId: string, grants: ExtensionEnableRequest['grants'], source: string): Problem | undefined {
    if (!source.startsWith('dev:') || readWorkspaceKind(this.#deps.connection, workspaceId) !== 'preview') return undefined;
    const forbidden = grants.requested.some((capability) => capability.name === 'process' || capability.name === 'network' || capability.name === 'kernel.admin');
    if (grants.isolation === 'sandboxed' && !forbidden) return undefined;
    return refusal(message, 'CAPABILITY_DENIED', { detail: 'a dev version in a preview workspace runs sandboxed and is never granted process, network, or kernel.admin' });
  }

  #activeVersion(name: string): ActiveVersion | undefined {
    const row = this.#deps.connection
      .prepare('SELECT v.source, v.integrity, v.digest FROM extensions e JOIN extension_versions v ON v.name = e.name AND v.digest = e.active_digest WHERE e.name = ?')
      .get(name);
    if (row === undefined) return undefined;
    const integrity = row['integrity'];
    return { source: String(row['source']), ...(typeof integrity === 'string' ? { integrity } : {}), digest: String(row['digest']) };
  }

  #namespaceProblem(message: Message, workspaceId: string, manifest: Manifest): Problem | undefined {
    const { name, namespace } = manifest.meta;
    const other = this.#deps.registry.current().manifestsEnabledIn(workspaceId).find((enabled) => enabled.meta.namespace === namespace && enabled.meta.name !== name);
    if (other === undefined) return undefined;
    return refusal(message, 'NAMESPACE_CONFLICT', { detail: `${other.meta.name} already owns the namespace "${namespace}" in this workspace`, hint: `disable ${other.meta.name} first` });
  }

  #providerProblem(message: Message, workspaceId: string, manifest: Manifest): Problem | undefined {
    const provided = new Map<string, string>();
    for (const enabled of this.#deps.registry.current().manifestsEnabledIn(workspaceId)) {
      if (enabled.meta.name === manifest.meta.name) continue;
      for (const provider of enabled.llm.providers) provided.set(provider.id, enabled.meta.name);
    }
    const clash = manifest.llm.providers.find((provider) => provided.has(provider.id));
    const owner = clash === undefined ? undefined : provided.get(clash.id);
    if (clash === undefined || owner === undefined) return undefined;
    return refusal(message, 'PROVIDER_CONFLICT', { detail: `${owner} and ${manifest.meta.name} both provide "${clash.id}"`, hint: `disable ${owner} first` });
  }

  #grantProblem(message: Message, manifest: Manifest, grants: ExtensionEnableRequest['grants'], builtin: boolean): Problem | undefined {
    const differences = grantDifferences(manifest, grants, builtin);
    if (differences === undefined) return undefined;
    const issues = [
      ...differences.missing.map((label) => ({ path: 'grants', message: `missing: ${label}` })),
      ...differences.unexpected.map((label) => ({ path: 'grants', message: `not requested: ${label}` })),
      ...(differences.isolation === undefined ? [] : [{ path: 'grants.isolation', message: differences.isolation }]),
    ];
    const params = { missing: differences.missing, unexpected: differences.unexpected, ...(differences.isolation === undefined ? {} : { isolation: differences.isolation }) };
    return refusal(message, 'CAPABILITY_DENIED', { detail: 'grants are all or nothing: they must equal what the extension requests', params, issues });
  }

  #requiresProblem(message: Message, workspaceId: string, manifest: Manifest): Problem | undefined {
    const provided = new Set([...this.#deps.registry.current().manifestsEnabledIn(workspaceId), manifest].flatMap((enabled) => enabled.types.map((entry) => entry.type)));
    const types = requiredTypes(manifest).filter((type) => !provided.has(type) && !kernelTypes.has(type));
    if (types.length === 0) return undefined;
    return refusal(message, 'EXT_REQUIRES_MISSING', { detail: `no extension enabled here provides ${types.join(', ')}`, hint: 'enable the extensions that provide them first', params: { types }, issues: types.map((type) => ({ path: 'requireTypes', message: `${type} is not provided` })) });
  }

  // 06 §6.4: the extensions enabled here whose requireTypes name one of its types.
  #dependents(workspaceId: string, name: string): string[] {
    const registry = this.#deps.registry.current();
    const provided = new Set((registry.manifestOf(name)?.types ?? []).map((entry) => entry.type));
    return registry.manifestsEnabledIn(workspaceId)
      .filter((enabled) => enabled.meta.name !== name && requiredTypes(enabled).some((type) => provided.has(type)))
      .map((enabled) => enabled.meta.name)
      .sort();
  }
}
