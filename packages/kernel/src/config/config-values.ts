import { configSecretFields, withoutSecretFields, type ConfigWriteScope, type Issue, type Json, type JsonObject, type Manifest } from '@kvman/protocol';
import type { PayloadValidators } from '../router/payload-validators.ts';

export type ConfigDefinition = NonNullable<Manifest['config']>;

function asObject(value: Json | undefined): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

// The schema's top-level defaults: the bottom layer of the merge (07 §7.5).
function defaultsOf(schema: JsonObject): JsonObject {
  const properties = asObject(schema['properties']) ?? {};
  return Object.fromEntries(Object.entries(properties).flatMap(([name, field]) => {
    const fallback = asObject(field)?.['default'];
    return fallback === undefined ? [] : [[name, fallback]];
  }));
}

// ADR 0125: schema defaults, then the global value, then the workspace's; a field that is present replaces the lower
// one whole.
export function mergedConfig(schema: JsonObject, global: JsonObject, workspace: JsonObject | undefined): JsonObject {
  return { ...defaultsOf(schema), ...global, ...workspace };
}

function valueAt(value: JsonObject, path: string): Json | undefined {
  let current: Json | undefined = value;
  for (const segment of path.split('.')) current = asObject(current)?.[segment];
  return current;
}

// A write's scope must be one the registration allows (ADR 0125).
export function scopeIssues(definition: ConfigDefinition, scope: ConfigWriteScope): Issue[] {
  if (definition.scope === 'both' || definition.scope === scope) return [];
  return [{ path: 'scope', message: `this config has scope ${definition.scope}; a ${scope} value cannot be stored`, hint: `write the ${definition.scope} value` }];
}

// A stored value never carries a secret (04 §4.7, ADR 0126).
export function secretIssues(schema: JsonObject, value: JsonObject): Issue[] {
  return configSecretFields(schema)
    .filter((path) => valueAt(value, path) !== undefined)
    .map((path) => ({ path, message: `${path} is a secret and is never stored in config`, hint: 'set it with kernel.secret.set or ctx.secrets.set' }));
}

// The merged value of a write's scope, checked against the schema without its secret fields (ADR 0125); each
// stripped schema is kept so it compiles once.
export class ConfigChecker {
  readonly #validators: PayloadValidators;
  readonly #stored = new WeakMap<JsonObject, JsonObject>();

  constructor(validators: PayloadValidators) {
    this.#validators = validators;
  }

  issues(schema: JsonObject, merged: JsonObject): Issue[] {
    let stored = this.#stored.get(schema);
    if (stored === undefined) {
      stored = withoutSecretFields(schema);
      this.#stored.set(schema, stored);
    }
    return this.#validators.issues(stored, merged, '');
  }
}

// ADR 0126: the last 4 characters are shown only for secrets of 12 or more characters.
export function redactedSecret(value: string): string {
  const characters = [...value];
  return characters.length >= 12 ? `••••${characters.slice(-4).join('')}` : '••••';
}
