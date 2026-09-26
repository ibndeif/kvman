import {
  compareByCodePoint, configGetRequestSchema, configSecretFields, workspaceGetRequestSchema, workspaceKindSchema, workspacesListRequestSchema,
  type ConfigGetResult, type Json, type JsonObject, type WorkspaceGetResult, type WorkspaceListing,
} from '@kvman/protocol';
import { mergedConfig, redactedSecret } from '../config/config-values.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { SecretStore } from '../secrets/secret-store.ts';
import { readConfigRow } from '../storage/config-rows.ts';
import type { Connection } from '../storage/driver.ts';
import { folderExists } from '../workspaces/workspace-paths.ts';
import type { ExtensionQueryAnswer } from './extension-queries.ts';

type WorkspaceRow = { id: string; path: string; name: string; kind: WorkspaceListing['kind'] };

function withValueAt(value: JsonObject, path: readonly string[], leaf: Json): JsonObject {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  const current = value[head];
  const nested = current !== null && typeof current === 'object' && !Array.isArray(current) ? current : {};
  return { ...value, [head]: rest.length === 0 ? leaf : withValueAt(nested, rest, leaf) };
}

// kernel.workspaces.list, kernel.workspace.get (ADR 0127), and kernel.config.get (ADR 0125).
export class WorkspaceQueries {
  readonly #connection: Connection;
  readonly #registry: RegistryState;
  readonly #secrets: SecretStore;

  constructor(connection: Connection, registry: RegistryState, secrets: SecretStore) {
    this.#connection = connection;
    this.#registry = registry;
    this.#secrets = secrets;
  }

  // Sorted by name, ties by path; `exists` from a stat now; trust arrives in M2.5.
  list(payload: unknown): ExtensionQueryAnswer<WorkspaceListing[]> {
    const { includePreview } = workspacesListRequestSchema.parse(payload);
    const listings = this.#rows()
      .filter((row) => includePreview === true || row.kind === 'normal')
      .sort((left, right) => compareByCodePoint(left.name, right.name) || compareByCodePoint(left.path, right.path))
      .map((row) => ({ ...row, trusted: false, exists: folderExists(row.path) }));
    return { ok: true, value: listings };
  }

  get(payload: unknown): ExtensionQueryAnswer<WorkspaceGetResult> {
    const { workspaceId } = workspaceGetRequestSchema.parse(payload);
    const row = this.#rows().find((candidate) => candidate.id === workspaceId);
    if (row === undefined) return { ok: false, code: 'WORKSPACE_INVALID', detail: `no workspace ${workspaceId} exists` };
    return { ok: true, value: { ...row, trust: null } };
  }

  // Each scope's row and the merged value, with every secret that is set shown redacted, never its value.
  config(payload: unknown): ExtensionQueryAnswer<ConfigGetResult> {
    const { extension, workspaceId } = configGetRequestSchema.parse(payload);
    const manifest = this.#registry.current().manifestOf(extension);
    if (manifest === undefined) return { ok: false, code: 'NOT_FOUND', detail: `no extension ${extension} is installed` };
    if (manifest.config === null) return { ok: false, code: 'NOT_FOUND', detail: `${extension} has no config` };
    if (workspaceId !== undefined && !this.#rows().some((row) => row.id === workspaceId)) return { ok: false, code: 'WORKSPACE_INVALID', detail: `no workspace ${workspaceId} exists` };
    const { schema } = manifest.config;
    const global = readConfigRow(this.#connection, extension, undefined);
    const workspace = workspaceId === undefined ? null : readConfigRow(this.#connection, extension, workspaceId);
    let merged = mergedConfig(schema, global.value, workspace?.value);
    for (const path of configSecretFields(schema)) {
      const secret = this.#secrets.get(extension, path);
      if (secret !== undefined) merged = withValueAt(merged, path.split('.'), redactedSecret(secret));
    }
    return { ok: true, value: { global, workspace, merged } };
  }

  #rows(): WorkspaceRow[] {
    return this.#connection
      .prepare('SELECT id, path, name, kind FROM workspaces')
      .all()
      .map((row) => ({ id: String(row['id']), path: String(row['path']), name: String(row['name']), kind: workspaceKindSchema.parse(row['kind']) }));
  }
}
