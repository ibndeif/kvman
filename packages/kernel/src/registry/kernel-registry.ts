import { matchesTypePattern, type JsonObject, type KernelErrorCode, type Manifest, type TypeEntry } from '@kvman/protocol';
import { kernelOwner, kernelTypeEntries } from './kernel-types.ts';

export type InstalledExtension = { manifest: Manifest; quarantined: boolean };

// The registry's inputs as data until install and enable read them from the database (M2.2, M2.3): every
// installed manifest, and the names of the extensions each workspace enables.
export type RegistryInput = { extensions: readonly InstalledExtension[]; enabled: ReadonlyMap<string, readonly string[]> };

export type RegistryFailure = { code: KernelErrorCode; detail: string; hint?: string };

export type ResolvedType = { extension: string; entry: TypeEntry; global: boolean };

export type TypeLookup = { ok: true; resolved: ResolvedType } | { ok: false; failure: RegistryFailure };

export type Subscriber = { extension: string; subscription: Manifest['subscriptions'][number] };

export type RegistryBuild = { ok: true; registry: KernelRegistry } | { ok: false; failure: RegistryFailure };

// The kernel owns its own types: it has no manifest, is available in every workspace, and is never quarantined.
type Owner = { name: string; extension: InstalledExtension | undefined; entry: TypeEntry };

// A handler's scheduling settings as its definition declares them (05 §5.5); the scheduler applies the defaults.
export type HandlerSettings = { concurrency?: number; maxAttempts?: number; timeoutMs?: number };

function namespaceConflict(workspaceId: string, extensions: readonly InstalledExtension[]): RegistryFailure | undefined {
  const byNamespace = new Map<string, string>();
  for (const { manifest } of extensions) {
    const other = byNamespace.get(manifest.meta.namespace);
    if (other !== undefined) {
      return { code: 'NAMESPACE_CONFLICT', detail: `${other} and ${manifest.meta.name} are both enabled in workspace ${workspaceId} with the namespace "${manifest.meta.namespace}"` };
    }
    byNamespace.set(manifest.meta.namespace, manifest.meta.name);
  }
  return undefined;
}

function settingsOf(definition: { concurrency?: number; maxAttempts?: number; timeoutMs?: number }): HandlerSettings {
  return {
    ...(definition.concurrency === undefined ? {} : { concurrency: definition.concurrency }),
    ...(definition.maxAttempts === undefined ? {} : { maxAttempts: definition.maxAttempts }),
    ...(definition.timeoutMs === undefined ? {} : { timeoutMs: definition.timeoutMs }),
  };
}

// ADR 0068: an exact subscription to another extension's live event is refused when the registry is built.
function liveSubscription(owners: ReadonlyMap<string, Owner[]>, extensions: readonly InstalledExtension[]): RegistryFailure | undefined {
  for (const { manifest } of extensions) {
    for (const { event } of manifest.subscriptions) {
      const live = owners.get(event)?.find((owner) => owner.entry.kind === 'event' && owner.entry.delivery === 'live');
      if (live !== undefined) {
        return { code: 'EXT_MANIFEST_INVALID', detail: `${manifest.meta.name} subscribes to "${event}", a live event of ${live.name}; live events reach only screens` };
      }
    }
  }
  return undefined;
}

// Answers which extension handles a type in a workspace, and which extensions subscribe to an event (03 §3.3 step 3,
// ADRs 0045, 0048). It holds manifests only; no extension code.
export class KernelRegistry {
  private readonly owners = new Map<string, Owner[]>();
  private readonly enabledIn = new Map<string, InstalledExtension[]>();
  private readonly enabledSomewhere = new Set<InstalledExtension>();

  private readonly installed = new Map<string, InstalledExtension>();

  private constructor(input: RegistryInput) {
    for (const entry of kernelTypeEntries()) this.owners.set(entry.type, [{ name: kernelOwner, extension: undefined, entry }]);
    for (const extension of input.extensions) {
      this.installed.set(extension.manifest.meta.name, extension);
      for (const entry of extension.manifest.types) {
        this.owners.set(entry.type, [...(this.owners.get(entry.type) ?? []), { name: extension.manifest.meta.name, extension, entry }]);
      }
    }
    for (const [workspaceId, names] of input.enabled) {
      const extensions = input.extensions.filter((extension) => names.includes(extension.manifest.meta.name));
      this.enabledIn.set(workspaceId, extensions);
      for (const extension of extensions) this.enabledSomewhere.add(extension);
    }
  }

  static build(input: RegistryInput): RegistryBuild {
    const registry = new KernelRegistry(input);
    const live = liveSubscription(registry.owners, input.extensions);
    if (live !== undefined) return { ok: false, failure: live };
    for (const [workspaceId, extensions] of registry.enabledIn) {
      const failure = namespaceConflict(workspaceId, extensions);
      if (failure !== undefined) return { ok: false, failure };
    }
    return { ok: true, registry };
  }

  lookup(type: string, workspaceId: string | undefined): TypeLookup {
    const owners = this.owners.get(type) ?? [];
    if (owners.length === 0) return this.failed('TYPE_NOT_FOUND', `no installed extension registers "${type}"`);
    const globalCommands = owners.filter((owner) => owner.entry.kind === 'command' && owner.entry.scope === 'global');
    if (globalCommands.length > 0) return this.resolveGlobally(type, globalCommands);
    if (workspaceId === undefined) {
      const kernel = owners.find((owner) => owner.extension === undefined);
      if (kernel !== undefined) return this.resolved(kernel, true, type);
      const events = owners.filter((owner) => owner.entry.kind === 'event');
      if (events.length > 0) return this.resolveGlobally(type, events);
      return this.failed('WORKSPACE_INVALID', `"${type}" needs a workspace and the message has none`, 'send it with a workspace id');
    }
    const enabled = this.enabledIn.get(workspaceId) ?? [];
    const owner = owners.find((candidate) => candidate.extension === undefined || enabled.includes(candidate.extension));
    if (owner === undefined) return this.failed('HANDLER_UNAVAILABLE', `no extension registering "${type}" is enabled in this workspace`);
    return this.resolved(owner, false, type);
  }

  subscribers(eventType: string, workspaceId: string | undefined): Subscriber[] {
    const live = (this.owners.get(eventType) ?? []).some((owner) => owner.entry.kind === 'event' && owner.entry.delivery === 'live');
    if (live) return [];
    const extensions = workspaceId === undefined ? [...this.enabledSomewhere] : (this.enabledIn.get(workspaceId) ?? []);
    return extensions
      .filter((extension) => !extension.quarantined)
      .flatMap(({ manifest }) => manifest.subscriptions
        .filter((subscription) => matchesTypePattern(subscription.event, eventType))
        .map((subscription) => ({ extension: manifest.meta.name, subscription })));
  }

  // An installed extension's manifest, which a host checks its setup against when it loads it (ADR 0071).
  manifestOf(extension: string): Manifest | undefined {
    return this.installed.get(extension)?.manifest;
  }

  // The scheduling settings of a handler named by its function reference (`command:<type>`, `subscription:<event>`).
  handler(extension: string, reference: string): HandlerSettings | undefined {
    const manifest = this.installed.get(extension)?.manifest;
    if (manifest === undefined) return undefined;
    const subscription = manifest.subscriptions.find((candidate) => `subscription:${candidate.event}` === reference);
    if (subscription !== undefined) return settingsOf(subscription);
    const entry = manifest.types.find((candidate) => `${candidate.kind}:${candidate.type}` === reference);
    if (entry?.kind === 'command') return settingsOf(entry);
    return entry?.kind === 'query' ? settingsOf({ ...(entry.timeoutMs === undefined ? {} : { timeoutMs: entry.timeoutMs }) }) : undefined;
  }

  // ADR 0111: what `/schema` lists: without a workspace every installed extension, with one those it enables; never
  // a quarantined one.
  listed(workspaceId: string | undefined): Manifest[] {
    const extensions = workspaceId === undefined ? [...this.installed.values()] : (this.enabledIn.get(workspaceId) ?? []);
    return extensions.filter((extension) => !extension.quarantined).map((extension) => extension.manifest);
  }

  // The config schemas of the installed extensions, which the preset secret check reads (ADR 0017).
  configSchemas(): Record<string, JsonObject> {
    return Object.fromEntries([...this.installed.values()].flatMap(({ manifest }) => (manifest.config === null ? [] : [[manifest.meta.name, manifest.config.schema]])));
  }

  // ADR 0086: a quarantined extension's pending messages wait; nothing of it is dispatched.
  isQuarantined(extension: string): boolean {
    return this.installed.get(extension)?.quarantined === true;
  }

  private resolveGlobally(type: string, owners: readonly Owner[]): TypeLookup {
    const enabled = owners.filter((owner) => owner.extension === undefined || this.enabledSomewhere.has(owner.extension));
    const [first, second] = enabled;
    if (second !== undefined && first !== undefined) {
      const names = `${first.name} and ${second.name}`;
      return this.failed('NAMESPACE_CONFLICT', `${names} both register "${type}" and are each enabled in a workspace`);
    }
    if (first === undefined) return this.failed('HANDLER_UNAVAILABLE', `the extension registering "${type}" is not enabled in any workspace`);
    return this.resolved(first, true, type);
  }

  private resolved(owner: Owner, global: boolean, type: string): TypeLookup {
    if (owner.extension?.quarantined === true) return this.failed('HANDLER_UNAVAILABLE', `${owner.name}, which registers "${type}", is quarantined`);
    return { ok: true, resolved: { extension: owner.name, entry: owner.entry, global } };
  }

  private failed(code: KernelErrorCode, detail: string, hint?: string): TypeLookup {
    return { ok: false, failure: hint === undefined ? { code, detail } : { code, detail, hint } };
  }
}
