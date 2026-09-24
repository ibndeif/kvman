import { matchesTypePattern, type KernelErrorCode, type Manifest, type TypeEntry } from '@kvman/protocol';

export type InstalledExtension = { manifest: Manifest; quarantined: boolean };

// The registry's inputs as data until install and enable read them from the database (M2.2, M2.3): every
// installed manifest, and the names of the extensions each workspace enables.
export type RegistryInput = { extensions: readonly InstalledExtension[]; enabled: ReadonlyMap<string, readonly string[]> };

export type RegistryFailure = { code: KernelErrorCode; detail: string; hint?: string };

export type ResolvedType = { extension: string; entry: TypeEntry; global: boolean };

export type TypeLookup = { ok: true; resolved: ResolvedType } | { ok: false; failure: RegistryFailure };

export type Subscriber = { extension: string; subscription: Manifest['subscriptions'][number] };

export type RegistryBuild = { ok: true; registry: KernelRegistry } | { ok: false; failure: RegistryFailure };

type Owner = { extension: InstalledExtension; entry: TypeEntry };

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

// Answers which extension handles a type in a workspace, and which extensions subscribe to an event (03 §3.3 step 3,
// ADRs 0045, 0048). It holds manifests only; no extension code.
export class KernelRegistry {
  private readonly owners = new Map<string, Owner[]>();
  private readonly enabledIn = new Map<string, InstalledExtension[]>();
  private readonly enabledSomewhere = new Set<InstalledExtension>();

  private constructor(input: RegistryInput) {
    for (const extension of input.extensions) {
      for (const entry of extension.manifest.types) {
        this.owners.set(entry.type, [...(this.owners.get(entry.type) ?? []), { extension, entry }]);
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
      const events = owners.filter((owner) => owner.entry.kind === 'event');
      if (events.length > 0) return this.resolveGlobally(type, events);
      return this.failed('WORKSPACE_INVALID', `"${type}" needs a workspace and the message has none`, 'send it with a workspace id');
    }
    const enabled = this.enabledIn.get(workspaceId) ?? [];
    const owner = owners.find((candidate) => enabled.includes(candidate.extension));
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

  private resolveGlobally(type: string, owners: readonly Owner[]): TypeLookup {
    const enabled = owners.filter((owner) => this.enabledSomewhere.has(owner.extension));
    const [first, second] = enabled;
    if (second !== undefined && first !== undefined) {
      const names = `${first.extension.manifest.meta.name} and ${second.extension.manifest.meta.name}`;
      return this.failed('NAMESPACE_CONFLICT', `${names} both register "${type}" and are each enabled in a workspace`);
    }
    if (first === undefined) return this.failed('HANDLER_UNAVAILABLE', `the extension registering "${type}" is not enabled in any workspace`);
    return this.resolved(first, true, type);
  }

  private resolved(owner: Owner, global: boolean, type: string): TypeLookup {
    if (owner.extension.quarantined) return this.failed('HANDLER_UNAVAILABLE', `${owner.extension.manifest.meta.name}, which registers "${type}", is quarantined`);
    return { ok: true, resolved: { extension: owner.extension.manifest.meta.name, entry: owner.entry, global } };
  }

  private failed(code: KernelErrorCode, detail: string, hint?: string): TypeLookup {
    return { ok: false, failure: hint === undefined ? { code, detail } : { code, detail, hint } };
  }
}
