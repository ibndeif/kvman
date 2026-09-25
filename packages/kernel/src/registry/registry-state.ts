import type { Connection } from '../storage/driver.ts';
import { KernelRegistry, type RegistryInput } from './kernel-registry.ts';

// The registry of the installed manifests, with every extension whose `extensions` row is quarantined marked so
// (ADR 0080); rebuilt after a quarantine commits.
export class RegistryState {
  readonly #input: RegistryInput;
  readonly #connection: Connection;
  #registry: KernelRegistry;

  constructor(input: RegistryInput, connection: Connection) {
    this.#input = input;
    this.#connection = connection;
    this.#registry = this.#build();
  }

  current(): KernelRegistry {
    return this.#registry;
  }

  refresh(): void {
    this.#registry = this.#build();
  }

  #build(): KernelRegistry {
    const quarantined = new Set(this.#connection.prepare("SELECT name FROM extensions WHERE status = 'quarantined'").all().map((row) => String(row['name'])));
    const extensions = this.#input.extensions.map((extension) => ({ ...extension, quarantined: extension.quarantined || quarantined.has(extension.manifest.meta.name) }));
    const build = KernelRegistry.build({ extensions, enabled: this.#input.enabled });
    if (!build.ok) throw new Error(`the registry cannot be built: ${build.failure.detail}`);
    return build.registry;
  }
}
