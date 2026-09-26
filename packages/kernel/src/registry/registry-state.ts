import { manifestSchema, presetSchema, type Capabilities, type Manifest } from '@kvman/protocol';
import type { GrantsSource } from '../router/grants.ts';
import type { Connection } from '../storage/driver.ts';
import { intersectGrants } from './grant-intersection.ts';
import { KernelRegistry, type InstalledExtension } from './kernel-registry.ts';

// The workspaces that enable each extension, read from their applied presets (ADR 0123).
export type EnabledExtensions = ReadonlyMap<string, readonly string[]>;

type InstalledRow = { name: string; digest: string; quarantined: boolean; manifestText: string };

// Each workspace's enabled extensions with their grants.
type EnabledGrants = Map<string, Map<string, Capabilities>>;

// The registry of the installed extensions (03 §3.9 step 5, ADR 0114) and of what each workspace's applied preset
// enables and grants (ADR 0123): each extension's active version from `extensions` and `extension_versions`,
// quarantined as its row says (ADR 0080). It is rebuilt after a change to extensions or applied presets commits.
export class RegistryState implements GrantsSource {
  readonly #connection: Connection;
  readonly #manifests = new Map<string, Manifest>();
  #digests = new Map<string, string>();
  #grants: EnabledGrants = new Map();
  #registry: KernelRegistry;

  constructor(connection: Connection) {
    this.#connection = connection;
    this.#registry = this.#build();
  }

  current(): KernelRegistry {
    return this.#registry;
  }

  // The active snapshot digest of an installed extension.
  digestOf(extension: string): string | undefined {
    return this.#digests.get(extension);
  }

  enabled(): EnabledExtensions {
    return new Map([...this.#grants].map(([workspaceId, extensions]) => [workspaceId, [...extensions.keys()]]));
  }

  // 05 §5.7: the grant of the workspace's applied preset; without a workspace, the intersection across the workspaces
  // that enable the extension (06 §6.4).
  capabilities(extension: string, workspaceId: string | undefined): Capabilities | undefined {
    if (workspaceId !== undefined) return this.#grants.get(workspaceId)?.get(extension);
    return intersectGrants([...this.#grants.values()].flatMap((extensions) => {
      const granted = extensions.get(extension);
      return granted === undefined ? [] : [granted];
    }));
  }

  refresh(): void {
    this.#registry = this.#build();
  }

  #rows(): InstalledRow[] {
    return this.#connection
      .prepare(`SELECT e.name, e.status, e.active_digest, v.manifest FROM extensions e
        JOIN extension_versions v ON v.name = e.name AND v.digest = e.active_digest ORDER BY e.name`)
      .all()
      .map((row) => ({ name: String(row['name']), digest: String(row['active_digest']), quarantined: row['status'] === 'quarantined', manifestText: String(row['manifest']) }));
  }

  #manifest(row: InstalledRow): Manifest {
    const key = `${row.name}@${row.digest}`;
    const known = this.#manifests.get(key);
    if (known !== undefined) return known;
    const manifest = manifestSchema.parse(JSON.parse(row.manifestText));
    this.#manifests.set(key, manifest);
    return manifest;
  }

  // Entries with `enabled: true` of every applied preset, for installed extensions only.
  #enabledGrants(installed: ReadonlySet<string>): EnabledGrants {
    const grants: EnabledGrants = new Map();
    for (const row of this.#connection.prepare('SELECT workspace_id, preset FROM workspace_presets ORDER BY workspace_id').all()) {
      const preset = presetSchema.parse(JSON.parse(String(row['preset'])));
      const enabled = Object.entries(preset.extensions).filter(([name, entry]) => entry.enabled && installed.has(name));
      grants.set(String(row['workspace_id']), new Map(enabled.map(([name, entry]) => [name, entry.grants])));
    }
    return grants;
  }

  #build(): KernelRegistry {
    const rows = this.#rows();
    this.#digests = new Map(rows.map((row) => [row.name, row.digest]));
    this.#grants = this.#enabledGrants(new Set(this.#digests.keys()));
    const extensions: InstalledExtension[] = rows.map((row) => ({ manifest: this.#manifest(row), quarantined: row.quarantined }));
    const build = KernelRegistry.build({ extensions, enabled: this.enabled() });
    if (!build.ok) throw new Error(`the registry cannot be built: ${build.failure.detail}`);
    return build.registry;
  }
}
