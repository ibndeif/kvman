import { manifestSchema, type Manifest } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';
import { KernelRegistry, type InstalledExtension } from './kernel-registry.ts';

// The workspaces that enable each extension, as data until M2.3 reads applied presets (ADR 0114).
export type EnabledExtensions = ReadonlyMap<string, readonly string[]>;

type InstalledRow = { name: string; digest: string; quarantined: boolean; manifestText: string };

// The registry of the installed extensions (03 §3.9 step 5, ADR 0114): each extension's active version from
// `extensions` and `extension_versions`, quarantined as its row says (ADR 0080). It is rebuilt after an install,
// an uninstall, or a quarantine commits.
export class RegistryState {
  readonly #enabled: EnabledExtensions;
  readonly #connection: Connection;
  readonly #manifests = new Map<string, Manifest>();
  #digests = new Map<string, string>();
  #registry: KernelRegistry;

  constructor(enabled: EnabledExtensions, connection: Connection) {
    this.#enabled = enabled;
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
    return this.#enabled;
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

  #build(): KernelRegistry {
    const rows = this.#rows();
    this.#digests = new Map(rows.map((row) => [row.name, row.digest]));
    const extensions: InstalledExtension[] = rows.map((row) => ({ manifest: this.#manifest(row), quarantined: row.quarantined }));
    const build = KernelRegistry.build({ extensions, enabled: this.#enabled });
    if (!build.ok) throw new Error(`the registry cannot be built: ${build.failure.detail}`);
    return build.registry;
  }
}
